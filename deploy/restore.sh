#!/usr/bin/env bash
# Restores the database of prod or staging from a backup file made by backup.sh.
# Run by hand on the server, never from CI:
#   ssh -t crm bash /opt/crm/prod/restore.sh prod /opt/crm/prod/backups/FILE.dump
#   ssh -t crm bash /opt/crm/staging/restore.sh staging [FILE]
#
# Usage: restore.sh ENV [BACKUP_FILE]
#   prod     needs the file
#   staging  without the file takes the newest backup of prod (/opt/crm/prod/backups): the data of staging
#            is a copy of prod. Run it again to make a fresh copy when the data of staging is spoiled.
#
# Steps: check the file -> show what gets replaced and wait for "yes" -> copy of the current
# database to backups/*_before-restore.dump (prod only: backups are made on prod only) -> stop the app ->
# drop and create the database -> load the backup -> staging only: migrations, because the backup of prod
# can be older than the image of staging -> start the same app version -> smoke /health.
# The app version never changes: to get back the version the backup was made with, run
# deploy.sh with the SHA from the file name first. Nothing is rolled back automatically.
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: restore.sh ENV [BACKUP_FILE], for example: restore.sh prod /opt/crm/prod/backups/2026-11-04_143012_SHA.dump" >&2
  exit 1
fi
env_name=$1
backup_file=""
if [[ $# -eq 2 ]]; then
  # A relative path is relative to where the script was started, so resolve it before cd
  backup_file=$(realpath --canonicalize-missing -- "$2")
fi

cd "$(dirname "$0")"
# shellcheck source=deploy/common.sh
source ./common.sh
init_env "$env_name"

require_env_file
if [[ -z "$backup_file" ]]; then
  [[ "$DEPLOY_ENV" == staging ]] || die "restore of prod needs a backup file, nothing was changed"
  # Names start with date and time: sorting by name sorts by age
  newest=$(find ../prod/backups -maxdepth 1 -type f -name '*.dump' 2>/dev/null | sort | tail --lines=1)
  [[ -n "$newest" ]] || die "no backups in $(realpath --canonicalize-missing ../prod/backups), nothing was changed"
  backup_file=$(realpath -- "$newest")
  log "No file given, taking the newest backup of prod"
fi
[[ -f "$backup_file" && -r "$backup_file" ]] || die "$backup_file is not a readable file, nothing was changed"
take_lock

version=$(running_app_version)
[[ "$version" != unknown ]] || die "no app version found in $DEPLOY_ENV, deploy the app first; nothing was changed"
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

The $DEPLOY_ENV database will be replaced with the backup.
  Backup file:     $backup_file
                   $(du -h "$backup_file" | cut -f 1), made $(date -r "$backup_file" '+%F %T')
  Backup made by:  app version $backup_version
  Database:        $db_name (docker compose project $DEPLOY_ENV, volume ${DEPLOY_ENV}_postgres_data),
                   all its current data is replaced
  App version:     $version, stays the same
EOF
if [[ "$DEPLOY_ENV" == staging ]]; then
  cat <<EOF

Staging has no backups of its own: the current data of staging is not saved, it is replaced with the copy.
After loading, the migrations of the app version above are applied to the copy.
EOF
elif [[ "$backup_version" == unknown ]]; then
  cat <<EOF

WARNING: the app version of the backup is unknown, it may not match the running one.
EOF
elif [[ "$backup_version" != "$version" ]]; then
  cat <<EOF

WARNING: the backup was made by another app version than the one running now.
  If the app does not work after the restore, deploy the version of the backup:
  bash $PWD/deploy.sh $DEPLOY_ENV $backup_version
EOF
fi
if [[ "$DEPLOY_ENV" == prod ]]; then
  cat <<EOF

Before that the current database is copied to $PWD/$BACKUP_DIR,
and the app is stopped until the restore ends.

EOF
else
  cat <<EOF

The app is stopped until the restore ends.

EOF
fi
printf 'Type yes to replace the database: '
read -r answer || answer=""
if [[ "$answer" != yes ]]; then
  log "Cancelled, nothing was changed"
  exit 1
fi

copy=""
if [[ "$DEPLOY_ENV" == prod ]]; then
  log "Copying the current database"
  copy=$(bash ./backup.sh before-restore) || die "could not copy the current database, nothing was changed"
fi

log "Stopping the app"
compose stop app

restore_failed() {
  log "ERROR: restore failed, the app is stopped and the database may be empty"
  if [[ -n "$copy" ]]; then
    log "To bring back the data from before the restore: bash $PWD/restore.sh $DEPLOY_ENV $copy"
  else
    log "To make the copy again: bash $PWD/restore.sh $DEPLOY_ENV"
  fi
  exit 1
}

log "Dropping and creating database $db_name"
# shellcheck disable=SC2016 # the variables expand inside the container
compose exec -T db sh -c '
  dropdb --username="$POSTGRES_USER" --maintenance-db=postgres --force "$POSTGRES_DB" &&
  createdb --username="$POSTGRES_USER" "$POSTGRES_DB"' </dev/null \
  || restore_failed

# The users of the database differ between environments: the copy must not carry owners and grants of prod
restore_args=(--no-owner)
if [[ "$DEPLOY_ENV" == staging ]]; then
  restore_args+=(--no-privileges)
fi

log "Loading $backup_file"
# shellcheck disable=SC2016 # the variables expand inside the container
compose exec -T db sh -c '
  pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
    "$@" --single-transaction --exit-on-error' sh "${restore_args[@]}" <"$backup_file" \
  || restore_failed

if [[ "$DEPLOY_ENV" == staging ]]; then
  log "Applying migrations"
  compose run --rm migrate || die "the database is restored from $backup_file, but migrations failed, the app was not started"
fi

log "Starting $APP_IMAGE"
compose up --detach app

smoke_test || die "the database is restored from $backup_file, but the app does not answer"

log "Restored database $db_name from $backup_file"
if [[ -n "$copy" ]]; then
  log "The data from before the restore is in $copy"
fi
