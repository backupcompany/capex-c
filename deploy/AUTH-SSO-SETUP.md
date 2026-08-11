# Azure SSO setup — Capex Pro @ capex.cgp-ai.com
#
# See deploy/.env.production.example for full production env.

## Auth mode switch

| CAPEX_AUTH_MODE | Login UI | Backend |
|-----------------|----------|---------|
| `password` | Email/password only | Password enabled |
| `sso` | Microsoft button only | Password disabled |
| `both` | Both | Both enabled |

Set on **both**:
- `capexbe/.env` → `CAPEX_AUTH_MODE=...`
- `capex-apps/.env` → `NEXT_PUBLIC_CAPEX_AUTH_MODE=...` (baked in Docker build)

**Now:** `password` — form login while SSO config is fixed.  
**Go-live SSO:** change to `sso` + rebuild web image.

---

## Azure App Registration (Capex App)

| Field | Value |
|-------|-------|
| Tenant ID | `c0946df4-4494-48d6-8091-eb4a5c18a316` |
| Client ID | `34a1836d-8b2b-4cdc-ba97-5ebb085ab39c` |
| Client Secret | Set in **Supabase Dashboard only** — rotate if exposed |

### Redirect URI di Azure (Web) — WAJIB ini

```
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

`https://capex.cgp-ai.com/auth/callback` **bukan** redirect URI Azure — itu URL Capex setelah Supabase selesai.

---

## Supabase Dashboard

1. **Authentication → Providers → Azure**
   - Client ID + Secret dari Azure
   - Tenant URL optional: `https://login.microsoftonline.com/c0946df4-4494-48d6-8091-eb4a5c18a316`

2. **Authentication → URL Configuration → Redirect URLs** (tambahkan):
   ```
   https://capex.cgp-ai.com/api/auth/azure/callback
   https://capex.cgp-ai.com/auth/callback
   http://localhost:3000/api/auth/azure/callback
   http://localhost:3000/auth/callback
   ```

3. **Site URL:** `https://capex.cgp-ai.com`

---

## OAuth flow (sudah di code)

```
Login → /api/auth/azure/start → Supabase authorize (Azure)
     → Azure login → Supabase /auth/v1/callback
     → redirect ke FRONTEND_URL + OAUTH_CALLBACK_PATH (?code=...)
     → capexbe exchange → httpOnly session cookies
```

---

## Production checklist (SSO go-live)

- [ ] Azure redirect = Supabase `/auth/v1/callback`
- [ ] Supabase Azure provider configured
- [ ] Supabase redirect URLs include capex.cgp-ai.com paths
- [ ] `ALLOWED_EMAIL_DOMAINS=siloamhospitals.com`
- [ ] `CAPEX_AUTH_MODE=sso` on BE + FE build
- [ ] User email exists in `public.users` before first SSO login
