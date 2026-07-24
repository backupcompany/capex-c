#!/usr/bin/env bash
# =============================================================================
# CAPEX Maintenance Page — install on VPS (Caddy static via gateway)
# Serves /opt/capex-maintenance through your reverse proxy (Caddy/nginx).
# Set CAPEX_PUBLIC_HOST, CAPEX_DEPLOY_DIR, CAPEX_GATEWAY_DIR as needed.
# =============================================================================
set -euo pipefail

SITE_DIR="${CAPEX_SITE_DIR:-/opt/capex-maintenance}"
REPO_DIR="${CAPEX_REPO_DIR:-}"
GATEWAY_DIR="${CAPEX_GATEWAY_DIR:-/opt/gateway}"
PUBLIC_HOST="${CAPEX_PUBLIC_HOST:-capex.example.com}"
DEPLOY_DIR="${CAPEX_DEPLOY_DIR:-/opt/capex-deploy}"

echo "==> CAPEX maintenance installer (Caddy static)"
echo "    site: $SITE_DIR"
echo "    gateway: $GATEWAY_DIR"
echo "    public host: $PUBLIC_HOST"

if [ -z "$REPO_DIR" ]; then
  for candidate in \
    "$HOME/capex" \
    "/opt/capex" \
    "/var/www/capex"; do
    if [ -f "$candidate/capex-apps/public/capex-v2.html" ]; then
      REPO_DIR="$candidate"
      break
    fi
    if [ -f "$candidate/../capex-apps/public/capex-v2.html" ]; then
      REPO_DIR="$(dirname "$candidate")"
      break
    fi
  done
fi

HTML_SRC=""
if [ -n "$REPO_DIR" ] && [ -f "$REPO_DIR/capex-apps/public/capex-v2.html" ]; then
  HTML_SRC="$REPO_DIR/capex-apps/public/capex-v2.html"
elif [ -f "$REPO_DIR/deploy/maintenance/site/index.html" ]; then
  HTML_SRC="$REPO_DIR/deploy/maintenance/site/index.html"
fi

sudo mkdir -p "$SITE_DIR/images"

if [ -n "$HTML_SRC" ]; then
  echo "==> Copy HTML from: $HTML_SRC"
  sudo cp "$HTML_SRC" "$SITE_DIR/index.html"
  if [ -f "$REPO_DIR/capex-apps/public/capex-pro-favicon.svg" ]; then
    sudo cp "$REPO_DIR/capex-apps/public/capex-pro-favicon.svg" "$SITE_DIR/"
  fi
  if [ -f "$REPO_DIR/capex-apps/public/images/login-bg.png" ]; then
    sudo cp "$REPO_DIR/capex-apps/public/images/login-bg.png" "$SITE_DIR/images/"
  fi
else
  echo "ERROR: HTML source not found. Set CAPEX_REPO_DIR or upload deploy/maintenance/site/"
  exit 1
fi

sudo chmod -R a+rX "$SITE_DIR"

# Stop full app stack — maintenance replaces capex-web/api
for dir in "$DEPLOY_DIR" "$HOME/capex-deploy"; do
  if [ -f "$dir/docker-compose.yml" ]; then
    echo "==> Stop capex-web / capex-api in $dir"
    (cd "$dir" && docker compose stop capex-web capex-api 2>/dev/null) || true
  fi
done

docker rm -f capex-maintenance capex-web 2>/dev/null || true

# Ensure Caddy serves static files (idempotent patch)
if [ -f "$GATEWAY_DIR/Caddyfile" ] && ! grep -q 'root \* /opt/capex-maintenance' "$GATEWAY_DIR/Caddyfile"; then
  echo "WARN: Caddyfile may still proxy to app — update $PUBLIC_HOST block manually (see DEPLOY.md)"
fi

if [ -f "$GATEWAY_DIR/docker-compose.yml" ] && ! grep -q '/opt/capex-maintenance' "$GATEWAY_DIR/docker-compose.yml"; then
  echo "==> Add static site volume to gateway Caddy"
  sudo sed -i '/- \.\/Caddyfile:\/etc\/caddy\/Caddyfile/a\      - /opt/capex-maintenance:/opt/capex-maintenance:ro' "$GATEWAY_DIR/docker-compose.yml"
fi

if [ -d "$GATEWAY_DIR" ]; then
  echo "==> Reload gateway Caddy"
  (cd "$GATEWAY_DIR" && docker compose up -d --force-recreate caddy)
fi

sleep 2
echo ""
echo "==> Smoke test (via Caddy):"
curl -sI -H "Host: ${PUBLIC_HOST}" https://127.0.0.1/ --insecure 2>/dev/null | head -3 || true
echo ""
echo "DONE. Public: https://${PUBLIC_HOST}/"
echo "Rollback: see DEPLOY.md"
