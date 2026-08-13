# Azure SSO — Capex Pro (direct Entra OAuth, no Supabase Auth broker)
#
# Flow:
#   Browser → Capex /api/auth/azure/start → Microsoft
#          → Capex /api/auth/azure/callback → BE exchanges code
#          → lookup public.users by email → Capex session cookies

## Auth mode switch

| CAPEX_AUTH_MODE | Login UI | Backend |
|-----------------|----------|---------|
| `password` | Email/password only | Password enabled |
| `sso` | Microsoft button only | Password disabled |
| `both` | Both | Both enabled |

Set on **both**:
- `capexbe/.env` → `CAPEX_AUTH_MODE=...`
- `capex-apps/.env` → `NEXT_PUBLIC_CAPEX_AUTH_MODE=...`

---

## Azure App Registration

| Field | Value |
|-------|-------|
| Tenant ID | `5db61118-5d18-4bfd-97fd-bc52cdad9c51` |
| Client ID | `c0946df4-4494-48d6-8091-eb4a5c18a316` |
| Client Secret | `AZURE_CLIENT_SECRET` in **capexbe/.env only** |

### Redirect URI di Azure (Web) — langsung ke Capex

```
http://localhost:3000/api/auth/azure/callback
https://dev-capexpro.siloamhospitals.com/api/auth/azure/callback
https://capexpro.siloamhospitals.com/api/auth/azure/callback
```

**Tidak** pakai `*.supabase.co/auth/v1/callback` — Capex sudah lepas dari Supabase Auth.

---

## Env (capexbe)

```env
AZURE_TENANT_ID=5db61118-5d18-4bfd-97fd-bc52cdad9c51
AZURE_CLIENT_ID=c0946df4-4494-48d6-8091-eb4a5c18a316
AZURE_CLIENT_SECRET=...

CAPEX_AUTH_MODE=sso
FRONTEND_URL=https://dev-capexpro.siloamhospitals.com
CORS_ORIGINS=https://dev-capexpro.siloamhospitals.com
OAUTH_CALLBACK_PATH=/api/auth/azure/callback
ALLOWED_EMAIL_DOMAINS=siloamhospitals.com
```

FE:

```env
NEXT_PUBLIC_CAPEX_AUTH_MODE=sso
NEXT_PUBLIC_USE_BACKEND_SESSION=true
```

---

## Local SSO testing (bisa bareng VPS Postgres)

Karena OAuth langsung ke Azure, **tidak** butuh Supabase Auth cloud.

1. Pastikan user email Microsoft ada di `public.users` (local Postgres)
2. Azure redirect include `localhost:3000/...`
3. Set `CAPEX_AUTH_MODE=sso` + Azure env di BE
4. `make run` (PostgREST lokal kalau `USE_VPS_POSTGRES=1`)
5. Login page → **Masuk dengan Microsoft**

---

## Production checklist

- [ ] Azure redirect URIs = Capex callback URLs (bukan Supabase)
- [ ] `AZURE_*` secrets di VPS `/opt/capex-deploy/.env`
- [ ] `CAPEX_AUTH_MODE=sso`
- [ ] `ALLOWED_EMAIL_DOMAINS=siloamhospitals.com`
- [ ] Email user ada di `public.users` sebelum first login
- [ ] `SUPABASE_URL=http://capex-postgrest` (Docker DNS — see SILOAM-VM-DB.md)
