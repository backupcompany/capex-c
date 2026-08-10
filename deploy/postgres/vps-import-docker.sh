#!/usr/bin/env bash
# Import CAPEX schema into postgres-core on VPS (database-platform stack).
#
# Usage (on VPS):
#   ./vps-import-docker.sh /path/to/capex-schema-only-latest.sql
#
set -euo pipefail

SQL_FILE="${1:-}"
CONTAINER="${POSTGRES_CONTAINER:-postgres-core}"
IMPORT_USER="${IMPORT_USER:-platform_admin}"
DB_USER="${DB_USER:-capex_app}"
DB_NAME="${DB_NAME:-capex}"

if [[ -z "$SQL_FILE" || ! -f "$SQL_FILE" ]]; then
  echo "Usage: $0 /path/to/capex-schema-only.sql" >&2
  exit 1
fi

echo "==> Ensure extensions"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$IMPORT_USER" -d "$DB_NAME" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
EOSQL

echo "==> Import into ${CONTAINER} / ${DB_NAME} as ${IMPORT_USER}"
sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' \
  -e '/^CREATE SCHEMA public;/d' \
  -e "/^SELECT pg_catalog.set_config('search_path', '', false);$/d" \
  "$SQL_FILE" | docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$IMPORT_USER" -d "$DB_NAME"

echo "==> Grant app user"
docker exec -i "$CONTAINER" psql -U "$IMPORT_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<EOSQL
GRANT ALL ON SCHEMA public TO ${DB_USER};
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${DB_USER};
ALTER ROLE ${DB_USER} BYPASSRLS;
EOSQL

echo "==> Verify"
docker exec "$CONTAINER" psql -U "$IMPORT_USER" -d "$DB_NAME" -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"

echo "==> Done"
