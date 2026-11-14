#!/usr/bin/env bash
# Gives the user OWNER_EMAIL of this environment demo contacts; does nothing if they already have contacts.
# Run by hand on the server:
#   ssh crm bash /opt/crm/prod/seed.sh prod
#   ssh crm bash /opt/crm/staging/seed.sh staging
#
# Usage: seed.sh ENV
# A one-off container from the image that runs now (current-image) in this environment.
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=deploy/common.sh
source ./common.sh
init_env "${1:-}"

require_env_file
current=$(cat current-image 2>/dev/null || true)
[[ -n "$current" ]] || die "no app version found in $DEPLOY_ENV, deploy the app first"
export APP_IMAGE=$current

compose run --rm seed
