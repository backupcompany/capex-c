#!/usr/bin/env bash
# Copy production compose + env template to VPS. Run once before first CI deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${CAPEX_VPS_HOST:-capex-vps}"
DEPLOY_PATH="${CAPEX_DEPLOY_PATH:-/opt/capex-deploy}"

echo "==> Bootstrap $HOST:$DEPLOY_PATH"

ssh "$HOST" "sudo mkdir -p '$DEPLOY_PATH' && sudo chown ubuntu:ubuntu '$DEPLOY_PATH'"

scp "$ROOT/deploy/docker-compose.production.yml" "$HOST:$DEPLOY_PATH/docker-compose.yml"

if ! ssh "$HOST" "test -f '$DEPLOY_PATH/.env'"; then
  scp "$ROOT/deploy/.env.vps.example" "$HOST:$DEPLOY_PATH/.env"
  echo "==> Created $DEPLOY_PATH/.env from template — EDIT SECRETS before compose up"
else
  echo "==> $DEPLOY_PATH/.env already exists — skipped"
fi

echo "==> Done. Next:"
echo "    ssh $HOST 'nano $DEPLOY_PATH/.env'"
echo "    ssh $HOST 'cd $DEPLOY_PATH && docker compose pull && docker compose up -d'"
