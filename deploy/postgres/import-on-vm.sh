#!/usr/bin/env bash
# Import CAPEX schema-only SQL into a fresh Postgres on VM.
#
# Usage (on VM):
#   export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=capex PGDATABASE=capex
#   ./import-on-vm.sh /path/to/capex-schema-only-latest.sql
#
set -euo pipefail

SQL_FILE="${1:-}"
if [[ -z "$SQL_FILE" || ! -f "$SQL_FILE" ]]; then
  echo "Usage: $0 /path/to/capex-schema-only.sql" >&2
  exit 1
fi

PSQL="${PSQL:-psql}"

echo "==> Ensure extensions"
"$PSQL" -v ON_ERROR_STOP=1 <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
-- CREATE EXTENSION IF NOT EXISTS vector;  -- uncomment if dump includes vector types
EOSQL

echo "==> Import schema (no data)"
"$PSQL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"

echo "==> Verify table count"
"$PSQL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"

echo "==> Done — database is empty (schema only)"
