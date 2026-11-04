# Shared code of deploy.sh, backup.sh and restore.sh, not run on its own.
# The scripts cd into their folder (/opt/crm/prod on the server) and source this file,
# so the relative paths below point there. compose needs APP_IMAGE exported first:
# deploy/compose.yaml refuses to load without it.

readonly REPOSITORY=ghcr.io/olgamrrz/personal-crm
readonly HEALTH_URL=http://127.0.0.1:3000/health
# shellcheck disable=SC2034 # used by backup.sh and restore.sh
readonly BACKUP_DIR=backups

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
die() {
  log "ERROR: $*"
  exit 1
}
compose() { docker compose -p prod "$@"; }

require_env_file() {
  [[ -f .env ]] || die "$PWD/.env not found, fill it in from .env.example"
  chmod 600 .env
}

# One deploy or restore at a time: auto-merge can start a deploy while restore.sh waits for "yes".
# The lock is released when the script exits.
take_lock() {
  exec 9>.lock
  flock --nonblock 9 || die "another deploy or restore is running on this server, try again when it ends"
}

# Commit SHA of the app version on this server, or "unknown". The image of the existing app
# container comes first: after a deploy with a failed smoke test it is newer than current-image,
# and the database already has its migrations. Without a container - current-image.
running_app_version() {
  local container image=""
  container=$(docker ps --all --quiet \
    --filter label=com.docker.compose.project=prod \
    --filter label=com.docker.compose.service=app | head --lines=1)
  if [[ -n "$container" ]]; then
    image=$(docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null || true)
  fi
  if [[ -z "$image" ]]; then
    image=$(cat current-image 2>/dev/null || true)
  fi
  if [[ "$image" == "$REPOSITORY:"* ]]; then
    printf '%s\n' "${image#"$REPOSITORY:"}"
  else
    printf 'unknown\n'
  fi
}

# The app has to answer 200 on /health within a minute
smoke_test() {
  local response
  log "Smoke test: $HEALTH_URL"
  for _ in $(seq 1 30); do
    if response=$(curl --fail --silent --max-time 5 "$HEALTH_URL"); then
      log "Smoke test passed: $response"
      return 0
    fi
    sleep 2
  done
  log "ERROR: smoke test failed: $HEALTH_URL did not answer 200 within a minute"
  compose logs --tail 50 app
  return 1
}
