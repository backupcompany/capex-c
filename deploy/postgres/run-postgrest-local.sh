#!/usr/bin/env bash
# PostgREST + /rest/v1 proxy (no Docker). Reads capexbe/.env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ROOT}/capexbe/.env"
PGRST_PORT="${PGRST_PORT:-13000}"
PROXY_PORT="${PROXY_PORT:-54321}"
PID_FILE="/tmp/capex-postgrest.pid"
PROXY_PID_FILE="/tmp/capex-postgrest-proxy.pid"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL not set" >&2
  exit 1
fi

PGRST_BIN="$(command -v postgrest || true)"
if [[ -z "$PGRST_BIN" ]]; then
  echo "ERROR: postgrest not found — brew install postgrest" >&2
  exit 1
fi

stop_if_running() {
  for f in "$PID_FILE" "$PROXY_PID_FILE"; do
    if [[ -f "$f" ]]; then
      kill "$(cat "$f")" 2>/dev/null || true
      rm -f "$f"
    fi
  done
}

case "${1:-up}" in
  down)
    stop_if_running
    echo "==> PostgREST stopped"
    exit 0
    ;;
  up) ;;
  *)
    echo "Usage: $0 [up|down]" >&2
    exit 1
    ;;
esac

stop_if_running

export PGRST_DB_URI="$DATABASE_URL"
export PGRST_DB_SCHEMAS="public"
export PGRST_DB_ANON_ROLE="capex_app"
export PGRST_DB_MAX_ROWS="50000"
export PGRST_SERVER_PORT="$PGRST_PORT"
export PGRST_JWT_SECRET="${SUPABASE_JWT_SECRET:?SUPABASE_JWT_SECRET required for VPS PostgREST}"
export PROXY_PORT PGRST_PORT

echo "==> PostgREST :${PGRST_PORT} → $(echo "$DATABASE_URL" | sed -E 's|://([^:/]+):([^@]+)@|://\1:***@|')"
nohup "$PGRST_BIN" >/tmp/capex-postgrest.log 2>&1 &
echo $! >"$PID_FILE"

nohup node -e "
const http = require('http');
const PROXY_PORT = Number(process.env.PROXY_PORT || 54321);
const PGRST = 'http://127.0.0.1:' + (process.env.PGRST_PORT || 13000);
const proxy = (req, res, pathWithQuery) => {
  const url = new URL(pathWithQuery, PGRST);
  const upstream = http.request(url, { method: req.method, headers: { ...req.headers, host: '127.0.0.1' } }, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => { res.writeHead(502, {'content-type':'application/json'}); res.end(JSON.stringify({message:'PostgREST unreachable'})); });
  req.pipe(upstream);
};
http.createServer((req, res) => {
  if (req.url === '/auth/v1/health') {
    res.writeHead(200, {'content-type':'application/json'});
    return res.end('{\"name\":\"GoTrue\",\"version\":\"vps-postgres-stub\"}');
  }
  if (req.url.startsWith('/rest/v1/')) return proxy(req, res, req.url.slice('/rest/v1'.length));
  res.writeHead(404); res.end('not found');
}).listen(PROXY_PORT, () => console.log('==> Proxy :' + PROXY_PORT + ' → PostgREST'));
" >/tmp/capex-postgrest-proxy.log 2>&1 &
echo $! >"$PROXY_PID_FILE"
disown -a 2>/dev/null || true

ok=0
for _ in $(seq 1 15); do
  sleep 1
  if curl -sf "http://127.0.0.1:${PROXY_PORT}/auth/v1/health" >/dev/null \
    && curl -sf "http://127.0.0.1:${PROXY_PORT}/rest/v1/users?select=id&limit=1" >/dev/null 2>&1; then
    ok=1
    break
  fi
done

if [[ "$ok" -eq 1 ]]; then
  echo "==> OK http://127.0.0.1:${PROXY_PORT} (SUPABASE_URL for VPS mode)"
else
  echo "ERROR: PostgREST not ready — see /tmp/capex-postgrest.log" >&2
  tail -20 /tmp/capex-postgrest.log 2>/dev/null || true
  exit 1
fi
