#!/usr/bin/env bash
# Deploys one image of personal-crm on this server: docker compose project "prod" or "staging".
# The same script and the same compose.yaml serve both; the environment is a parameter, and each one
# lives in its own folder (/opt/crm/prod, /opt/crm/staging) with its own .env.
#
# Usage: deploy.sh [--registry-user USER] ENV TAG
#   ENV                   prod or staging
#   TAG                   commit SHA the image was built from: ghcr.io/olgamrrz/personal-crm:TAG
#   --registry-user USER  read a GHCR token from stdin and use it only for this pull
#
# Steps: database -> backup of the database (prod only) -> migrations in a one-off container ->
# new app container -> smoke /health. A failed step stops the script.
# Nothing is rolled back automatically: to go back, run this script by hand with the tag
# from previous-image; to bring back the data, restore.sh with a file from backups/.
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=deploy/common.sh
source ./common.sh

registry_user=""
if [[ "${1:-}" == "--registry-user" ]]; then
  registry_user=${2:?--registry-user needs a value}
  shift 2
fi
if [[ $# -ne 2 ]]; then
  die "usage: deploy.sh [--registry-user USER] ENV TAG"
fi
init_env "$1"
tag=$2
export APP_IMAGE="$REPOSITORY:$tag"

require_env_file
take_lock

if ! docker image inspect "$APP_IMAGE" >/dev/null 2>&1; then
  log "Pulling $APP_IMAGE"
  if [[ -n "$registry_user" ]]; then
    # Throwaway docker config: the registry token is not left on the server
    docker_config=$(mktemp -d)
    trap 'rm -rf "$docker_config"' EXIT
    DOCKER_CONFIG=$docker_config docker login ghcr.io --username "$registry_user" --password-stdin >/dev/null
    DOCKER_CONFIG=$docker_config docker pull --quiet "$APP_IMAGE"
  else
    docker pull --quiet "$APP_IMAGE"
  fi
fi

log "Starting database"
compose up --detach --wait db

# Backups are made on prod only. Named after the version running before this deploy: the data matches
# its migrations. The file path it prints is in its own log already.
if [[ "$DEPLOY_ENV" == prod ]]; then
  bash ./backup.sh deploy >/dev/null || die "database backup failed, the new image was not started"
fi

log "Applying migrations"
if ! compose run --rm migrate; then
  die "migrations failed, the new image was not started"
fi

log "Starting $APP_IMAGE"
compose up --detach app

smoke_test || exit 1

# Keep only the current and the previous app image of each environment, so the disk does not fill up
current=$(cat current-image 2>/dev/null || true)
if [[ "$current" != "$APP_IMAGE" ]]; then
  previous=$current
else
  previous=$(cat previous-image 2>/dev/null || true)
fi
printf '%s\n' "$APP_IMAGE" > current-image
printf '%s\n' "$previous" > previous-image

# The lists of both environments are read after current-image and previous-image of this one are written
docker image ls "$REPOSITORY" --format '{{.Repository}}:{{.Tag}}' \
  | { grep --invert-match --line-regexp --fixed-strings -e "$APP_IMAGE" -e "$REPOSITORY:<none>" -f <(keep_images) || true; } \
  | xargs --no-run-if-empty docker image rm \
  || log "WARNING: could not remove old images, check disk space: docker image ls $REPOSITORY"

log "Deployed $APP_IMAGE to $DEPLOY_ENV"
