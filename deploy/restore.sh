#!/usr/bin/env bash
# Restores the prod database from a backup file made by backup.sh.
# Run by hand on the server, never from CI:
#   ssh -t crm bash /opt/crm/prod/restore.sh /opt/crm/prod/backups/FILE.dump
#
# Steps: check the file -> show what gets replaced and wait for "yes" -> copy of the current
# database to backups/*_before-restore.dump -> stop the app -> drop and create the database ->
# load the backup -> start the same app version -> smoke /health.
# The app version never changes: to get back the version the backup was made with, run
# deploy.sh with the SHA from the file name first. Nothing is rolled back automatically.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: restore.sh BACKUP_FILE, for example: restore.sh /opt/crm/prod/backups/2026-11-04_143012_SHA.dump" >&2
  exit 1
fi
# A relative path is relative to where the script was started, so resolve it before cd
backup_file=$(realpath --canonicalize-missing -- "$1")

cd "$(dirname "$0")"
# shellcheck source=deploy/common.sh
source ./common.sh

require_env_file
[[ -f "$backup_file" && -r "$backup_file" ]] || die "$backup_file is not a readable file, nothing was changed"
take_lock

version=$(running_app_version)
[[ "$version" != unknown ]] || die "no app version found on this server, deploy the app first; nothing was changed"
export APP_IMAGE="$REPOSITORY:$version"

log "Starting database"
compose up --detach --wait db

compose exec -T db pg_restore --list <"$backup_file" >/dev/null \
  || die "$backup_file is not a database backup, nothing was changed"

# shellcheck disable=SC2016 # the variable expands inside the container
db_name=$(compose exec -T db sh -c 'printf %s "$POSTGRES_DB"' </dev/null)
# Backup names are DATE_TIME_SHA.dump or DATE_TIME_SHA_KIND.dump, see backup.sh
backup_version=$(basename "$backup_file" | cut -d _ -f 3 | cut -d . -f 1)
[[ "$backup_version" =~ ^[0-9a-f]{40}$ ]] || backup_version=unknown

cat <<EOF

The prod database will be replaced with the backup.
  Backup file:     $backup_file
                   $(du -h "$backup_file" | cut -f 1), made $(date -r "$backup_file" '+%F %T')
  Backup made by:  app version $backup_version
  Database:        $db_name (docker compose project prod, volume prod_postgres_data),
                   all its current data is replaced
  App version:     $version, stays the same
EOF
if [[ "$backup_version" == unknown ]]; then
  cat <<EOF

WARNING: the app version of the backup is unknown, it may not match the running one.
EOF
elif [[ "$backup_version" != "$version" ]]; then
  cat <<EOF

WARNING: the backup was made by another app version than the one running now.
  If the app does not work after the restore, deploy the version of the backup:
  bash $PWD/deploy.sh $backup_version
EOF
fi
cat <<EOF

Before that the current database is copied to $PWD/$BACKUP_DIR,
and the app is stopped until the restore ends.

EOF
printf 'Type yes to replace the database: '
read -r answer || answer=""
if [[ "$answer" != yes ]]; then
  log "Cancelled, nothing was changed"
  exit 1
fi

log "Copying the current database"
copy=$(bash ./backup.sh before-restore) || die "could not copy the current database, nothing was changed"

log "Stopping the app"
compose stop app

restore_failed() {
  log "ERROR: restore failed, the app is stopped and the database may be empty"
  log "To bring back the data from before the restore: bash $PWD/restore.sh $copy"
  exit 1
}

log "Dropping and creating database $db_name"
# shellcheck disable=SC2016 # the variables expand inside the container
compose exec -T db sh -c '
  dropdb --username="$POSTGRES_USER" --maintenance-db=postgres --force "$POSTGRES_DB" &&
  createdb --username="$POSTGRES_USER" "$POSTGRES_DB"' </dev/null \
  || restore_failed

log "Loading $backup_file"
# shellcheck disable=SC2016 # the variables expand inside the container
compose exec -T db sh -c '
  pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
    --no-owner --single-transaction --exit-on-error' <"$backup_file" \
  || restore_failed

log "Starting $APP_IMAGE"
compose up --detach app

smoke_test || die "the database is restored from $backup_file, but the app does not answer"

log "Restored database $db_name from $backup_file"
log "The data from before the restore is in $copy"
