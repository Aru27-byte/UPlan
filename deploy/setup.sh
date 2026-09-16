#!/usr/bin/env bash
# TechDesign/system-architecture.md — one-time VM setup: Docker, the repo clone, secrets file
# placeholders, and (once F2 ships) the two pinned model files. Run once on a freshly built VM, or
# to rebuild after a lost VM (the reserved IP keeps the city's DNS record valid).
set -euo pipefail

REPO_URL="${REPO_URL:?set REPO_URL to this repository's clone URL}"
REPO_DIR="/opt/uplan"

apt-get update
apt-get install -y --no-install-recommends docker.io docker-compose-plugin git

mkdir -p /etc/uplan
for f in app.env postgres.env; do
  if [ ! -f "/etc/uplan/$f" ]; then
    touch "/etc/uplan/$f"
    chmod 600 "/etc/uplan/$f"
    echo "created empty /etc/uplan/$f — fill in its values before first deploy"
  fi
done

if [ ! -d "$REPO_DIR" ]; then
  git clone "$REPO_URL" "$REPO_DIR"
fi

echo "setup complete. Fill in /etc/uplan/app.env and /etc/uplan/postgres.env, then run deploy.sh <tag>."
