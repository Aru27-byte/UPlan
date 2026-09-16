#!/usr/bin/env bash
# TechDesign/system-architecture.md — "Deploying": fetches a tag whose CI passed, builds images on
# the VM, runs migrate, then recreates worker and web. Takes an exclusive lock so two deploys can't
# interleave (system-architecture.md's Concurrency table: "Two deploys start at once").
set -euo pipefail

TAG="${1:?usage: deploy.sh <tag>}"
REPO_DIR="/opt/uplan"
LOCK_FILE="/var/run/uplan-deploy.lock"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "another deploy is already in progress" >&2
  exit 1
fi

cd "$REPO_DIR"
git fetch --tags origin
git checkout "$TAG"

export TAG
docker compose -f deploy/compose.yaml build

docker compose -f deploy/compose.yaml run --rm migrate

docker compose -f deploy/compose.yaml up -d --no-deps worker web

echo "deployed $TAG"
