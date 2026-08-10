#!/usr/bin/env bash
# Clone CAPEX schema (no data) to VPS postgres-core.
#
# Preferred: pg_dump when SUPABASE_DB_PASSWORD available
# Fallback:  deploy/postgres/artifacts/capex-schema-only-latest.sql (MCP export)
#
# Usage:
#   ./deploy/postgres/clone-to-vps.sh
#   SUPABASE_DB_PASSWORD='...' EXCLUDE_TOR=1 ./deploy/postgres/clone-to-vps.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VPS="${VPS_HOST:-capex-vps}"
SQL="${SCHEMA_SQL:-$ROOT/deploy/postgres/artifacts/capex-schema-only-latest.sql}"

if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "==> Export via pg_dump"
  SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" EXCLUDE_TOR="${EXCLUDE_TOR:-1}" \
    "$ROOT/deploy/postgres/export-capex-schema.sh"
  SQL="$ROOT/deploy/postgres/artifacts/capex-schema-only-latest.sql"
fi

if [[ ! -f "$SQL" ]]; then
  echo "ERROR: No schema SQL at $SQL" >&2
  echo "  Set SUPABASE_DB_PASSWORD for pg_dump, or generate MCP artifact first." >&2
  exit 1
fi

echo "==> Copy to $VPS"
scp "$SQL" \
  "$ROOT/deploy/postgres/vps-import-docker.sh" \
  "$ROOT/deploy/postgres/vps-expose-env.sh" \
  "$VPS:/tmp/"

echo "==> Import + expose env on VPS"
ssh "$VPS" 'chmod +x /tmp/vps-import-docker.sh /tmp/vps-expose-env.sh && /tmp/vps-import-docker.sh /tmp/capex-schema-only-latest.sql && sudo /tmp/vps-expose-env.sh'

echo "==> Done. Env: /opt/capex-deploy/.env on VPS"
