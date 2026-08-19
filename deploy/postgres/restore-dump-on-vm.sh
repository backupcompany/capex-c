#!/usr/bin/env bash
# Restore PostgreSQL custom dump (-Fc) into local capex-postgres.
# Does NOT change authorization code — schema/data only.
#
# Usage (on Siloam VM, after docker-compose.db.yml is up):
#   ./deploy/postgres/restore-dump-on-vm.sh /path/to/capex.dump
#
# Optional:
#   CONTAINER=capex-postgres PGUSER=capex_app PGDATABASE=capex ./restore-dump-on-vm.sh ./capex.dump
#
set -euo pipefail

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: $0 /path/to/capex.dump" >&2
  exit 1
fi

CONTAINER="${CONTAINER:-capex-postgres}"
PGUSER="${PGUSER:-capex_app}"
PGDATABASE="${PGDATABASE:-capex}"

echo "==> Copy dump into $CONTAINER"
docker cp "$DUMP" "$CONTAINER:/tmp/capex.dump"

echo "==> Extensions"
docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS vector;
SQL

echo "==> pg_restore (clean, no-owner)"
# Power Automate trigger may reference missing net schema — ignore that error later if present.
docker exec -i "$CONTAINER" pg_restore \
  -U "$PGUSER" \
  -d "$PGDATABASE" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  /tmp/capex.dump \
  || true

echo "==> Disable Power Automate trigger if present (no pg_net on VM)"
docker exec -i "$CONTAINER" psql -U postgres -d "$PGDATABASE" -c \
  "ALTER TABLE IF EXISTS assets DISABLE TRIGGER IF EXISTS trigger_send_asset;" 2>/dev/null \
  || docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -c \
  "SELECT 1;" >/dev/null

# Prefer platform_admin / superuser if available
docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=0 <<'SQL'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'assets' AND t.tgname = 'trigger_send_asset' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'ALTER TABLE assets DISABLE TRIGGER trigger_send_asset';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'skip trigger disable (need superuser)';
END $$;
SQL

echo "==> Auth session table usable via PostgREST (RLS off — Capex BE is sole writer)"
docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=0 <<'SQL'
ALTER TABLE IF EXISTS public.auth_sessions DISABLE ROW LEVEL SECURITY;
UPDATE public.users SET email = lower(trim(email)) WHERE email <> lower(trim(email));
SQL

echo "==> Counts"
docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -Atc "
SELECT 'projects|' || count(*) FROM projects
UNION ALL SELECT 'assets|' || count(*) FROM assets
UNION ALL SELECT 'users|' || count(*) FROM users
UNION ALL SELECT 'roles|' || count(*) FROM roles;
"

echo "==> Done. Restart PostgREST if schema was empty before:"
echo "    docker restart capex-postgrest-engine capex-postgrest"
