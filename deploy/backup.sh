#!/usr/bin/env bash
# Backs up the prod database (docker compose project "prod") to backups/ next to this script.
#
# Usage: backup.sh [deploy|before-restore]
#   no argument     backup by hand: ssh crm bash /opt/crm/prod/backup.sh
#                   -> backups/DATE_TIME_SHA_manual.dump, never removed automatically
#   deploy          run by deploy.sh before migrations -> backups/DATE_TIME_SHA.dump;
#                   only the newest KEEP_DEPLOY_BACKUPS of these stay
#   before-restore  run by restore.sh before it drops the database
#                   -> backups/DATE_TIME_SHA_before-restore.dump, never removed automatically
#
# SHA is the app version running now, so the name tells which version the data belongs to.
# The database must be running: the script does not start it.
# Prints the path of the new file on stdout; messages go to stderr.
set -euo pipefail

# Messages to stderr, so that stdout holds only the path: copy=$(bash backup.sh before-restore)
exec 3>&1 1>&2

cd "$(dirname "$0")"
# shellcheck source=deploy/common.sh
source ./common.sh

readonly KEEP_DEPLOY_BACKUPS=30

kind=${1:-manual}
case "$kind" in
  deploy) suffix="" ;;
  manual | before-restore) suffix="_$kind" ;;
  *) die "usage: backup.sh [deploy|before-restore]" ;;
esac

require_env_file
version=$(running_app_version)
# deploy.sh and restore.sh have set it already; any value lets compose load compose.yaml
export APP_IMAGE=${APP_IMAGE:-$REPOSITORY:$version}

file="$BACKUP_DIR/$(date '+%F_%H%M%S')_${version}${suffix}.dump"
log "Backing up the database to $PWD/$file"

# Backups hold personal data: only the owner can read them
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
# pg_dump runs inside the db container: always the same version as the database.
# Written under a temporary name, so a dump that fails half-way never looks like a backup;
# the redirect is inside the parentheses, so the file is created with umask 077.
# shellcheck disable=SC2016 # the variables expand inside the container
if ! (umask 077 && compose exec -T db sh -c \
  'pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom' \
  </dev/null >"$file.partial"); then
  rm -f "$file.partial"
  die "database backup failed"
fi
mv "$file.partial" "$file"
log "Backup saved: $PWD/$file ($(du -h "$file" | cut -f 1))"

# Keep the newest deploy backups. Only exact deploy backup names match, so manual,
# before-restore and any other files stay. Names start with date and time: sorting by name
# sorts by age.
if [[ "$kind" == deploy ]]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f -regextype posix-extended \
    -regex '.*/[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}_([0-9a-f]{40}|unknown)\.dump' -printf '%f\n' \
    | sort \
    | head --lines=-"$KEEP_DEPLOY_BACKUPS" \
    | while read -r name; do
      rm -f -- "${BACKUP_DIR:?}/$name"
      log "Removed old backup $name"
    done \
    || log "WARNING: could not remove old backups, check disk space: ls -l $PWD/$BACKUP_DIR"
fi

printf '%s\n' "$PWD/$file" >&3
