# Deploy

Checklist dan panduan deploy production setelah remediasi.

---

## Prerequisites

- Node.js 20+ (build)
- Supabase project dengan migrations applied
- Redis instance (recommended prod — throttling, lockout, cache)
- Reverse proxy (nginx template: `deploy/nginx-capex-ip-allowlist.conf`)

---

## Database migrations

Apply **berurutan** di Supabase SQL editor atau CLI:

```
capex-apps/supabase/migrations/
├── 20260721120000_security_rls_hardening.sql
├── 20260721140000_capex_security_foundation.sql
├── 20260721160000_capex_security_phase2_lock_authenticated.sql
├── 20260721190000_capex_security_restore_steady_state.sql
├── 20260722100000_capex_security_revoke_authenticated_rpc.sql
├── 20260722220000_assets_add_cpr_id.sql
└── 20260723100000_audit_logs_append_only.sql
```

Verify steady state:

```bash
# Anon read users → empty or permission denied (NOT 200 with rows)
curl -s "$SUPABASE_URL/rest/v1/users?select=id&limit=1" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"

# BE without JWT → 401
curl -s -o /dev/null -w "%{http_code}" "$CAPEXBE_URL/bootstrap" -X POST
```

---

## Environment variables

### capexbe (required prod)

```env
NODE_ENV=production
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # NEVER NEXT_PUBLIC_*
SUPABASE_JWT_SECRET=...
JWT_ACCESS_SECRET=<strong-random-64>   # blocked if weak/default
CORS_ORIGINS=https://your-domain.com
REDIS_URL=redis://:password@host:6379   # recommended
METRICS_SECRET=<random>                 # for /metrics scrape
IP_ALLOWLIST=1.2.3.4,5.6.7.8           # recommended
```

### capex-apps (required prod)

```env
NODE_ENV=production
NEXT_PUBLIC_CAPEXBE_URL=https://api.your-domain.com
NEXT_PUBLIC_USE_BACKEND_SESSION=1       # REQUIRED — else 503
JWT_ACCESS_SECRET=<same-as-be>          # for edge session verify
IP_ALLOWLIST=1.2.3.4,5.6.7.8
```

### Do NOT set in prod

```env
CURSOR_TUNNEL_MODE=true    # bypasses IP allowlist
METRICS_PUBLIC=1           # blocked at BE startup
DEMO_MODE=true             # relaxes rate limits
```

---

## Pre-deploy verification

```bash
# Backend security (6 checks)
cd capexbe && npm run verify:security

# Frontend middleware
cd capex-apps && node scripts/verify-middleware-security.mjs

# Production build + secret scan
cd capex-apps && npm run build:secure
cd capexbe && npm run build
```

---

## Deploy checklist

- [ ] All migrations applied (20260721* → 20260723100000)
- [ ] `JWT_ACCESS_SECRET` strong, unique, same on FE+BE
- [ ] `NEXT_PUBLIC_USE_BACKEND_SESSION=1`
- [ ] `IP_ALLOWLIST` set on FE + BE
- [ ] `REDIS_URL` with password, private network
- [ ] `CORS_ORIGINS` matches prod domain
- [ ] `METRICS_SECRET` set, `/metrics` not public
- [ ] nginx/Cloudflare configured
- [ ] `verify:security` pass
- [ ] Smoke: Network tab shows **no** `*.supabase.co/rest/v1/`
- [ ] Smoke: login → navigate screens → no 401/403 loop
- [ ] Unset demo/tunnel env vars

---

## Docker reference

Templates (not production-ready out of box):

```
deploy/docker-compose.public.example.yml  ← bind 127.0.0.1
deploy/docker-compose.redis.yml           ← local dev Redis
deploy/nginx-capex-ip-allowlist.conf      ← IP allowlist template
```

Dockerfiles exist but lack non-root user and HEALTHCHECK — harden before prod use.

---

## Rollback strategy

1. BE rollback: deploy previous container/image — sessions in DB remain valid
2. FE rollback: deploy previous Next.js build — ensure same JWT secret
3. DB rollback: migrations are **forward-only** (RLS revoke, append-only triggers). Rollback requires manual SQL — test in staging first.

---

[Lihat README](./README.md) · [Security](./SECURITY.md)
