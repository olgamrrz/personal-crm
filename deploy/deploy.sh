#!/usr/bin/env bash
# Deploys one image of personal-crm on this server (docker compose project "prod").
#
# Usage: deploy.sh [--registry-user USER] TAG
#   TAG                   commit SHA the image was built from: ghcr.io/olgamrrz/personal-crm:TAG
#   --registry-user USER  read a GHCR token from stdin and use it only for this pull
#
# Steps: database -> migrations in a one-off container -> new app container -> smoke /health.
# A failed step stops the script. Nothing is rolled back automatically: to go back,
# run this script by hand with the tag from previous-image.
set -euo pipefail

cd "$(dirname "$0")"

readonly REPOSITORY=ghcr.io/olgamrrz/personal-crm
readonly HEALTH_URL=http://127.0.0.1:3000/health

registry_user=""
if [[ "${1:-}" == "--registry-user" ]]; then
  registry_user=${2:?--registry-user needs a value}
  shift 2
fi
tag=${1:?usage: deploy.sh [--registry-user USER] TAG}
export APP_IMAGE="$REPOSITORY:$tag"

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
compose() { docker compose -p prod "$@"; }

if [[ ! -f .env ]]; then
  log "ERROR: $PWD/.env not found, fill it in from .env.example"
  exit 1
fi
chmod 600 .env

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

log "Applying migrations"
if ! compose run --rm migrate; then
  log "ERROR: migrations failed, the new image was not started"
  exit 1
fi

log "Starting $APP_IMAGE"
compose up --detach app

log "Smoke test: $HEALTH_URL"
healthy=false
for _ in $(seq 1 30); do
  if response=$(curl --fail --silent --max-time 5 "$HEALTH_URL"); then
    healthy=true
    break
  fi
  sleep 2
done
if [[ "$healthy" != true ]]; then
  log "ERROR: smoke test failed: $HEALTH_URL did not answer 200 within a minute"
  compose logs --tail 50 app
  exit 1
fi
log "Smoke test passed: $response"

# Keep only the current and the previous app image, so the disk does not fill up
current=$(cat current-image 2>/dev/null || true)
if [[ "$current" != "$APP_IMAGE" ]]; then
  previous=$current
else
  previous=$(cat previous-image 2>/dev/null || true)
fi
printf '%s\n' "$APP_IMAGE" > current-image
printf '%s\n' "$previous" > previous-image

docker image ls "$REPOSITORY" --format '{{.Repository}}:{{.Tag}}' \
  | { grep --invert-match --line-regexp --fixed-strings -e "$APP_IMAGE" -e "$previous" -e "$REPOSITORY:<none>" || true; } \
  | xargs --no-run-if-empty docker image rm \
  || log "WARNING: could not remove old images, check disk space: docker image ls $REPOSITORY"

log "Deployed $APP_IMAGE"
