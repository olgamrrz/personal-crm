# Shared code of deploy.sh, backup.sh, restore.sh and install-schedule.sh, not run on its own.
# The scripts cd into their folder (/opt/crm/prod or /opt/crm/staging on the server) and source this file,
# so the relative paths below point there. Every script calls init_env ENV first: it sets the
# environment ("prod" or "staging") and checks that the folder belongs to it. compose needs APP_IMAGE
# exported first: deploy/compose.yaml refuses to load without it.

readonly REPOSITORY=ghcr.io/olgamrrz/personal-crm
# shellcheck disable=SC2034 # used by backup.sh and restore.sh
readonly BACKUP_DIR=backups

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
die() {
  log "ERROR: $*"
  exit 1
}

# Sets DEPLOY_ENV, the host port of the app, its health address and the memory limits of the containers
# (0 - no limit). The same image runs in both environments; only these settings differ.
init_env() {
  DEPLOY_ENV=${1:-}
  case "$DEPLOY_ENV" in
    prod)
      APP_PORT=3000
      APP_MEM_LIMIT=0
      DB_MEM_LIMIT=0
      ;;
    staging)
      APP_PORT=3001
      APP_MEM_LIMIT=384m
      DB_MEM_LIMIT=256m
      ;;
    *) die "environment must be prod or staging, got '$DEPLOY_ENV'" ;;
  esac
  # Each environment has its own folder with its own .env, lock, backups and image history.
  # This stops a staging deploy from running in the prod folder and the other way round.
  [[ "$(basename "$PWD")" == "$DEPLOY_ENV" ]] \
    || die "environment $DEPLOY_ENV must run from a folder named $DEPLOY_ENV, not $PWD"
  HEALTH_URL=http://127.0.0.1:$APP_PORT/health
  export APP_PORT APP_MEM_LIMIT DB_MEM_LIMIT
}

compose() { docker compose -p "$DEPLOY_ENV" "$@"; }

require_env_file() {
  [[ -f .env ]] || die "$PWD/.env not found, fill it in from .env.example"
  chmod 600 .env
}

# One deploy or restore at a time in an environment: auto-merge can start a deploy while restore.sh waits for "yes".
# The lock file is in the folder of the environment, so staging and prod do not wait for each other.
# The lock is released when the script exits.
take_lock() {
  exec 9>.lock
  flock --nonblock 9 || die "another deploy or restore is running in $DEPLOY_ENV, try again when it ends"
}

# Commit SHA of the app version in this environment, or "unknown". The image of the existing app
# container comes first: after a deploy with a failed smoke test it is newer than current-image,
# and the database already has its migrations. Without a container - current-image.
running_app_version() {
  local container image=""
  container=$(docker ps --all --quiet \
    --filter "label=com.docker.compose.project=$DEPLOY_ENV" \
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

# Images that must stay on the server whatever their age: the two last versions of prod (the current one
# and the one to roll back to) and the current version of staging. Staging and prod share one image name,
# so a cleanup started by prod must not remove what staging runs.
keep_images() {
  local file
  for file in ../prod/current-image ../prod/previous-image ../staging/current-image; do
    if [[ -s "$file" ]]; then
      cat "$file"
    fi
  done
}

# Removes images of the app older than MAX_IMAGE_AGE_DAYS, except keep_images. The age is the build date
# of the image. An image of a running container cannot be removed: docker refuses, and that is only a warning.
# Run after a good prod deploy, once current-image and previous-image of prod are written.
readonly MAX_IMAGE_AGE_DAYS=14
remove_old_images() {
  local keep oldest image created
  keep=$(keep_images)
  oldest=$(date --date "$MAX_IMAGE_AGE_DAYS days ago" '+%s')
  docker image ls "$REPOSITORY" --format '{{.Repository}}:{{.Tag}}' | while read -r image; do
    [[ "$image" != "$REPOSITORY:<none>" ]] || continue
    grep --quiet --line-regexp --fixed-strings -- "$image" <<<"$keep" && continue
    created=$(docker image inspect --format '{{.Created}}' "$image")
    if [[ "$(date --date "$created" '+%s')" -lt "$oldest" ]]; then
      log "Removing old image $image (built $created)"
      docker image rm "$image" >/dev/null || log "WARNING: could not remove $image"
    fi
  done
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
