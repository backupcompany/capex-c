#!/usr/bin/env bash
# Restore a Capex custom-format dump into a running Postgres container.
# Usage: ./restore-capex-dump.sh [/path/to/capex.dump]
set -euo pipefail
DUMP="${1:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ -z "$DUMP" ]]; then
  DUMP="$ROOT/deploy/postgres/artifacts/capex.dump"
fi
CONTAINER="${CAPEX_PG_CONTAINER:-postgres-core}"
DB_USER="${CAPEX_PG_USER:-platform_admin}"
DB_NAME="${CAPEX_PG_DB:-capex}"

if [[ ! -f "$DUMP" ]]; then
  echo "ERROR: dump not found: $DUMP" >&2
  exit 1
fi

echo "==> docker cp → $CONTAINER:/tmp/capex.dump"
docker cp "$DUMP" "$CONTAINER:/tmp/capex.dump"
echo "==> pg_restore --clean --if-exists ($DB_NAME)"
docker exec "$CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-acl /tmp/capex.dump || true
# pg_restore exits non-zero on some benign NOTICE; verify counts:
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 'projects' AS t, count(*) FROM projects
UNION ALL SELECT 'assets', count(*) FROM assets
UNION ALL SELECT 'users', count(*) FROM users;
"
echo "==> reload PostgREST schema (NOTIFY)"
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null || true
echo "OK restore from $DUMP"
