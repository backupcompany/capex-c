#!/usr/bin/env bash
# Copy production compose + env template to VM. Run once before first CI deploy.
# See deploy/VM-SETUP.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${CAPEX_VPS_HOST:-capex-vps}"
DEPLOY_PATH="${CAPEX_DEPLOY_PATH:-/opt/capex-deploy}"

echo "==> Bootstrap $HOST:$DEPLOY_PATH"

ssh "$HOST" "sudo mkdir -p '$DEPLOY_PATH' && sudo chown ubuntu:ubuntu '$DEPLOY_PATH'"

scp "$ROOT/deploy/docker-compose.production.yml" "$HOST:$DEPLOY_PATH/docker-compose.yml"
scp "$ROOT/deploy/caddy/Caddyfile.capex" "$HOST:$DEPLOY_PATH/Caddyfile.capex"

if ! ssh "$HOST" "test -f '$DEPLOY_PATH/.env'"; then
  scp "$ROOT/deploy/.env.vps.example" "$HOST:$DEPLOY_PATH/.env"
  echo "==> Created $DEPLOY_PATH/.env from template — EDIT SECRETS before compose up"
else
  echo "==> $DEPLOY_PATH/.env already exists — skipped (compose + Caddy snippet refreshed)"
fi

echo "==> Done. Next:"
echo "    1) ssh $HOST 'nano $DEPLOY_PATH/.env'   # fill secrets"
echo "    2) Merge $DEPLOY_PATH/Caddyfile.capex into gateway Caddyfile, then reload caddy"
echo "    3) ssh $HOST 'cd $DEPLOY_PATH && docker compose pull && docker compose up -d'"
echo "    Full guide: deploy/VM-SETUP.md"