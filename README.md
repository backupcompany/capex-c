# CAPEX

Capital expenditure planning and tracking for Siloam Hospitals (multi hospital-unit scope).

| | |
|---|---|
| **Stack** | Next.js (BFF + UI) · NestJS services · Supabase Postgres · Redis |
| **Auth** | Microsoft SSO · httpOnly session · RBAC |

## Structure

| Path | Role |
|------|------|
| `capex-apps/` | Frontend + BFF (`/api/be` proxy, middleware) |
| `capexbe/` | Shared backend logic + health gateway |
| `services/capex-*` | Domain HTTP services (auth + 17 modules) |
| `packages/` | Shared libraries |
| `deploy/` | Docker Compose production stack |

## Local development

```bash
make setup
make run          # frontend :3000, backend :3001
```

## Production (VPS — monolith)

GitHub Actions deploys **`capex-web` + `capex-api`** (2 containers). One env file on VPS:

```bash
cp deploy/.env.vps.example /opt/capex-deploy/.env   # fill secrets; no CAPEX_SERVICE_*
```

See [DEPLOY.md](./DEPLOY.md) and [SECURITY.md](./SECURITY.md).

### Optional: full microservices stack (local / staging manual)

```bash
cp deploy/.env.compose.example deploy/.env.compose
make prod-up
```

## Verification

```bash
make verify-prod-readiness    # security + build gate
make compose-up && make compose-verify
cd capexbe && npm run verify:security
```
