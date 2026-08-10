#!/usr/bin/env bash
# Export Supabase Postgres schema (no data) for VM / self-hosted Postgres.
#
# Requires: pg_dump (libpq), Supabase database password
# Dashboard → Project Settings → Database → Connection string (URI) → password
#
# Usage:
#   SUPABASE_DB_PASSWORD='your-db-password' ./deploy/postgres/export-capex-schema.sh
#   SUPABASE_DB_PASSWORD='...' EXCLUDE_TOR=1 ./deploy/postgres/export-capex-schema.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/deploy/postgres/artifacts}"
mkdir -p "$OUT_DIR"

PROJECT_REF="${SUPABASE_PROJECT_REF:-abbgvfuanefrnxtttllo}"
DB_PASSWORD="${SUPABASE_DB_PASSWORD:-${DATABASE_URL_PASSWORD:-}}"
# Default: Session pooler (IPv4). Direct db.* is IPv6-only — often fails from laptop/VPS.
DB_HOST="${SUPABASE_DB_HOST:-aws-1-ap-northeast-1.pooler.supabase.com}"
DB_PORT="${SUPABASE_DB_PORT:-5432}"
DB_USER="${SUPABASE_DB_USER:-postgres.${PROJECT_REF}}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
SCHEMA="${CAPEX_EXPORT_SCHEMA:-public}"
EXCLUDE_TOR="${EXCLUDE_TOR:-0}"

if [[ -z "$DB_PASSWORD" ]]; then
  echo "ERROR: Set SUPABASE_DB_PASSWORD (Database password from Supabase Dashboard)." >&2
  echo "  Project: $PROJECT_REF" >&2
  echo "  Example: SUPABASE_DB_PASSWORD='***' $0" >&2
  exit 1
fi

PG_DUMP="${PG_DUMP:-pg_dump}"
if ! command -v "$PG_DUMP" >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found. Install: brew install libpq && brew link --force libpq" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${OUT_FILE:-$OUT_DIR/capex-schema-only-${SCHEMA}-${STAMP}.sql}"
LATEST_LINK="$OUT_DIR/capex-schema-only-latest.sql"

EXCLUDE_ARGS=()
if [[ "$EXCLUDE_TOR" == "1" ]]; then
  echo "==> EXCLUDE_TOR=1 — skipping tor_* tables"
  TOR_LIST=""
  if TOR_LIST="$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc \
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tor_%' ORDER BY 1;" 2>/dev/null)"; then
  while IFS= read -r t; do
    [[ -n "$t" ]] && EXCLUDE_ARGS+=(--exclude-table="public.${t}")
  done <<< "$TOR_LIST"
  EXCLUDE_ARGS+=(--exclude-table="public.tor_profiles_with_user_pii")
  else
    echo "WARN: could not list tor_* tables (DNS/IPv6?) — pass --exclude-table manually or use pooler host" >&2
  fi
fi

echo "==> Export schema-only from Supabase Postgres"
echo "    host: $DB_HOST"
echo "    schema: $SCHEMA"
echo "    out:  $OUT_FILE"

PGPASSWORD="$DB_PASSWORD" "$PG_DUMP" \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --schema="$SCHEMA" \
  "${EXCLUDE_ARGS[@]}" \
  -f "$OUT_FILE"

# VM-friendly header
TMP="$(mktemp)"
{
  cat <<EOF
-- CAPEX schema-only export (no data)
-- Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
-- Source: Supabase project ${PROJECT_REF}, schema ${SCHEMA}
-- Import: see deploy/postgres/README-VM-POSTGRES.md
--
-- Recommended VM extensions (run before this file if missing):
--   CREATE EXTENSION IF NOT EXISTS pgcrypto;
--   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--   CREATE EXTENSION IF NOT EXISTS citext;
--   CREATE EXTENSION IF NOT EXISTS vector;  -- only if tor/AI tables included
--
EOF
  cat "$OUT_FILE"
} > "$TMP"
mv "$TMP" "$OUT_FILE"

if [[ "$EXCLUDE_TOR" == "1" ]]; then
  echo "==> Strip tor_* functions/views from dump"
  python3 - "$OUT_FILE" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
text = re.sub(r"CREATE FUNCTION public\.tor_[\s\S]*?\$function\$;\n", "", text)
text = re.sub(r"CREATE VIEW public\.tor_[\s\S]*?;\n\n", "", text)
text = re.sub(r"CREATE SEQUENCE public\.tor_[\s\S]*?;\n\n", "", text)
text = re.sub(r"ALTER SEQUENCE public\.tor_[^\n]*;\n\n", "", text)
open(path, "w", encoding="utf-8").write(text)
PY
fi

ln -sf "$(basename "$OUT_FILE")" "$LATEST_LINK"

echo "==> Done"
echo "    $(wc -l < "$OUT_FILE") lines → $OUT_FILE"
echo "    latest → $LATEST_LINK"
