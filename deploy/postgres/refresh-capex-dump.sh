#!/usr/bin/env bash
# Refresh deploy/postgres/artifacts/capex.dump from VPS postgres-core.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/deploy/postgres/artifacts/capex.dump"
HOST="${CAPEX_VPS_HOST:-capex-vps}"
CONTAINER="${CAPEX_PG_CONTAINER:-postgres-core}"
DB_USER="${CAPEX_PG_USER:-platform_admin}"
DB_NAME="${CAPEX_PG_DB:-capex}"

mkdir -p "$(dirname "$OUT")"
ssh -o BatchMode=yes "$HOST" "docker exec $CONTAINER pg_dump -U $DB_USER -d $DB_NAME -Fc --no-owner --no-acl -f /tmp/capex.dump && docker cp $CONTAINER:/tmp/capex.dump /tmp/capex.dump"
scp -o BatchMode=yes "$HOST:/tmp/capex.dump" "$OUT"
ls -lah "$OUT"
echo "OK → $OUT"
