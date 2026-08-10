#!/usr/bin/env bash
# Write CAPEX Postgres env on VPS:
#   /opt/capex-deploy/.env              — app containers (postgres-core:5432)
#   /opt/capex-deploy/postgres-ssh.env  — developers (SSH tunnel → localhost)
#
# Usage (on VPS as ubuntu):
#   sudo ./vps-expose-env.sh
#
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/capex-deploy}"
SECRETS="${SECRETS:-/opt/database-platform/postgres/secrets/capex.env}"
SSH_LOCAL_PORT="${SSH_LOCAL_PORT:-5433}"
VPS_SSH_HOST="${VPS_SSH_HOST:-capex-vps}"

if [[ ! -f "$SECRETS" ]]; then
  echo "ERROR: missing $SECRETS" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$SECRETS"

sudo mkdir -p "$DEPLOY_DIR"

# Internal (Docker network on VPS)
sudo tee "${DEPLOY_DIR}/.env" >/dev/null <<EOF
# CAPEX VM Postgres — internal (containers on same Docker network)
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
EOF

# SSH tunnel (laptop / CI → VPS postgres-core bound 127.0.0.1:5432)
sudo tee "${DEPLOY_DIR}/postgres-ssh.env" >/dev/null <<EOF
# CAPEX Postgres on VPS — access via SSH tunnel (official)
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
#
# 1) Open tunnel (keep running):
#    ssh -N -L ${SSH_LOCAL_PORT}:127.0.0.1:5432 ${VPS_SSH_HOST}
#
# 2) Connect:
#    psql "\$DATABASE_URL"
#
SSH_TUNNEL_CMD=ssh -N -L ${SSH_LOCAL_PORT}:127.0.0.1:5432 ${VPS_SSH_HOST}
PGHOST=127.0.0.1
PGPORT=${SSH_LOCAL_PORT}
PGUSER=${DB_USER}
PGDATABASE=${DB_NAME}
PGPASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${SSH_LOCAL_PORT}/${DB_NAME}
DB_HOST=127.0.0.1
DB_PORT=${SSH_LOCAL_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
# VPS internal (no tunnel): postgresql://${DB_USER}:***@postgres-core:5432/${DB_NAME}
EOF

sudo chmod 640 "${DEPLOY_DIR}/.env" "${DEPLOY_DIR}/postgres-ssh.env"
sudo chown ubuntu:ubuntu "${DEPLOY_DIR}/.env" "${DEPLOY_DIR}/postgres-ssh.env" 2>/dev/null || true

echo "==> Wrote ${DEPLOY_DIR}/.env (internal)"
echo "==> Wrote ${DEPLOY_DIR}/postgres-ssh.env (SSH tunnel → localhost:${SSH_LOCAL_PORT})"
