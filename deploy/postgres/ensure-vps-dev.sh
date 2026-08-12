#!/usr/bin/env bash
# Ensure SSH tunnel + local PostgREST when USE_VPS_POSTGRES=1.
# Idempotent — safe to call from `make check-env` / `make run`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ROOT}/capexbe/.env"
TUNNEL_PID_FILE="/tmp/capex-pg-tunnel.pid"
TUNNEL_LOG="/tmp/capex-pg-tunnel.log"
PROXY_PORT="${PROXY_PORT:-54321}"
PGRST_PORT="${PGRST_PORT:-13000}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ "${USE_VPS_POSTGRES:-}" != "1" && "${USE_VPS_POSTGRES:-}" != "true" ]]; then
  exit 0
fi

port_open() {
  local port="$1"
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return $?
  fi
  (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
}

strip_quotes() {
  local v="$1"
  v="${v%\"}"
  v="${v#\"}"
  v="${v%\'}"
  v="${v#\'}"
  printf '%s' "$v"
}

PG_LOCAL_PORT="${PGPORT:-${DB_PORT:-5433}}"

echo "==> VPS Postgres mode — ensuring tunnel :${PG_LOCAL_PORT} + PostgREST :${PROXY_PORT}"

if port_open "$PG_LOCAL_PORT"; then
  echo "OK  SSH tunnel already up :${PG_LOCAL_PORT}"
else
  CMD="$(strip_quotes "${SSH_TUNNEL_CMD:-ssh -N -L ${PG_LOCAL_PORT}:127.0.0.1:5432 capex-vps}")"
  echo "==> Starting SSH tunnel: ${CMD}"
  # shellcheck disable=SC2086
  nohup $CMD >"$TUNNEL_LOG" 2>&1 &
  echo $! >"$TUNNEL_PID_FILE"
  ok=0
  for _ in $(seq 1 30); do
    sleep 0.5
    if port_open "$PG_LOCAL_PORT"; then
      ok=1
      break
    fi
  done
  if [[ "$ok" -ne 1 ]]; then
    echo "ERROR: SSH tunnel failed on :${PG_LOCAL_PORT} — see ${TUNNEL_LOG}" >&2
    tail -20 "$TUNNEL_LOG" 2>/dev/null || true
    exit 1
  fi
  echo "OK  SSH tunnel :${PG_LOCAL_PORT}"
fi

if curl -sf "http://127.0.0.1:${PROXY_PORT}/auth/v1/health" >/dev/null 2>&1 \
  && curl -sf "http://127.0.0.1:${PROXY_PORT}/rest/v1/users?select=id&limit=1" >/dev/null 2>&1; then
  echo "OK  PostgREST already up :${PROXY_PORT}"
  exit 0
fi

chmod +x "${ROOT}/deploy/postgres/run-postgrest-local.sh"
PROXY_PORT="$PROXY_PORT" PGRST_PORT="$PGRST_PORT" "${ROOT}/deploy/postgres/run-postgrest-local.sh" up
