#!/usr/bin/env bash
# Finds the commit SHA that Deploy prod may roll out: one that was deployed to staging successfully.
# Runs on the GitHub runner (not on the server), called by .github/workflows/deploy-prod.yml.
# The history of staging deploys is the list of GitHub deployments of the "staging" environment.
#
# Usage: find-tested-sha.sh [SHA]
#   no SHA   prints the SHA of the newest successful staging deploy
#   SHA      checks that this SHA has a successful staging deploy and prints it
# Needs GH_TOKEN and GITHUB_REPOSITORY in the environment. Prints only the SHA on stdout.
set -euo pipefail

readonly ENVIRONMENT=staging
# How many of the newest staging deploys are looked at
readonly MAX_DEPLOYMENTS=100

die() {
  echo "ERROR: $*" >&2
  exit 1
}

wanted=${1:-}
if [[ -n "$wanted" && ! "$wanted" =~ ^[0-9a-f]{40}$ ]]; then
  die "SHA must be the full 40-character commit SHA in lower case"
fi

# Newest first. A deploy counts as successful if it EVER had a "success" status: GitHub moves
# the older successful deploys to "inactive" when a newer one succeeds, so the latest status says nothing.
query="repos/$GITHUB_REPOSITORY/deployments?environment=$ENVIRONMENT&per_page=$MAX_DEPLOYMENTS"
if [[ -n "$wanted" ]]; then
  query="$query&sha=$wanted"
fi
deployments=$(gh api "$query" --jq '.[] | "\(.id) \(.sha)"')

while read -r id sha; do
  [[ -n "$id" ]] || continue
  successes=$(gh api "repos/$GITHUB_REPOSITORY/deployments/$id/statuses" --jq '[.[] | select(.state == "success")] | length')
  if [[ "$successes" -gt 0 ]]; then
    echo "$sha"
    exit 0
  fi
done <<<"$deployments"

if [[ -n "$wanted" ]]; then
  die "$wanted has no successful deploy to staging (looked at the last $MAX_DEPLOYMENTS). Deploy it to staging first"
fi
die "no successful deploy to staging found (looked at the last $MAX_DEPLOYMENTS)"
