# Deploy

Production gate: `make verify-prod-readiness`

## Architecture (VPS production — default)

| Process | Role |
|---------|------|
| `capex-web` | Next.js BFF + UI (public :443 via Caddy/Cloudflare) |
| `capex-api` | NestJS **monolith** — all business logic (:8082 localhost) |
| Supabase Postgres | Data + RLS |
| Redis | Throttle, lockout, cache (recommended) |

**CI/CD:** `.github/workflows/deploy-web.yml` + `deploy-api.yml` → GHCR → SSH VPS (`docker compose pull` + recreate).

**Do not set `CAPEX_SERVICE_*` on production VPS.** BFF proxies everything to `capex-api` via `NEXT_PUBLIC_CAPEXBE_URL` / internal `http://capex-api:8082`.

### Optional (manual / dev only)

Full strangler stack (`capex-auth` + 17 leaf services): [deploy/docker-compose.microservices.yml](./deploy/docker-compose.microservices.yml). Not used by production CI/CD. Requires `deploy/.env.compose` + all internal service URLs wired in compose.

## Prerequisites

- Node.js 20+
- Supabase project with migrations applied
- Redis (recommended)
- Reverse proxy + TLS (template: `deploy/nginx-capex-ip-allowlist.conf`)

## Migrations

Apply in order under `capex-apps/supabase/migrations/` (20260721* through 20260723100000).

## Environment — VPS monolith (production)

One env file on the VPS for **`capex-api`** (e.g. `/opt/capex-deploy/.env`):

```bash
cp deploy/.env.vps.example /opt/capex-deploy/.env
# edit secrets — never commit .env
```

Required on **capex-api**:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `JWT_ACCESS_SECRET` (same value on `capex-web` server runtime)
- `NODE_ENV=production`, `CORS_ORIGINS`, `FRONTEND_URL`
- `REDIS_URL` (recommended)

Required on **capex-web** (runtime, not build-args):

- `JWT_ACCESS_SECRET` (must match API)

Baked at **image build** (GitHub Secrets / `deploy-web.yml`):

- `NEXT_PUBLIC_CAPEXBE_URL`
- `NEXT_PUBLIC_USE_BACKEND_SESSION=true`
- `NEXT_PUBLIC_ENABLE_AZURE_SSO=true`

**Leave unset in production:** all `CAPEX_SERVICE_*`, `CAPEX_DEMO_MODE`, `CURSOR_TUNNEL_MODE`, `METRICS_PUBLIC=1`.

Local dev: `make run` — see `capexbe/.env` + `capex-apps/.env.local`. No leaf URLs needed for monolith.

## Environment — microservices stack (optional)

```bash
cp deploy/.env.compose.example deploy/.env.compose   # or: make compose-env
make prod-up
```

Uses shared `deploy/.env.compose` + internal URLs in `docker-compose.microservices.yml`.

## Deploy (VPS monolith)

1. `make verify-prod-readiness`
2. Push to `main` → GitHub Actions builds + deploys images
3. VPS: `docker compose pull && docker compose up -d` in deploy dir
4. Expose only `capex-web` via reverse proxy; `capex-api` on `127.0.0.1` only

## Deploy (full microservices — manual)

```bash
make verify-prod-readiness
make compose-build && make compose-up
make compose-verify
```

## Checklist

- [ ] `make verify-prod-readiness` green
- [ ] Migrations applied
- [ ] VPS `.env` filled — **no** `CAPEX_SERVICE_*`
- [ ] `JWT_ACCESS_SECRET` identical on web + api
- [ ] SSO redirect URI registered in Azure Entra
- [ ] Smoke: SSO login, project list, no direct Supabase REST in browser Network tab
