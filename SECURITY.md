# Security

Defense-in-depth yang diimplementasikan selama remediasi 22–23 Juli 2026.

**Score: 7.6 / 10 overall** (dari ~5.5 inherited)

---

## Inherited risks (kondisi overtake)

| Risk | Severity | Kondisi inherited |
|------|----------|-------------------|
| Direct PostgREST dari browser | Critical | Anon key bisa hit tables langsung |
| RBAC hanya di UI | High | Bypass via API call jika session valid |
| Secrets di client bundle | High | Potensi `NEXT_PUBLIC_SUPABASE_*`, API keys |
| No brute-force protection | Medium | Unlimited login attempts |
| No audit immutability | Medium | Audit logs bisa di-update/delete |
| PII full dump ke client | High | Bootstrap return all users dengan email/phone |

Semua item di atas **sudah di-address** di sprint remediasi. Detail per layer di bawah.

---

## Layer 1 — Edge (Next.js middleware)

**File:** `capex-apps/middleware.ts`

| Control | Behavior |
|---------|----------|
| Session gate | JWT verify via `edgeSession.ts`; unauthenticated → redirect `/` |
| CSRF | Double-submit cookie + header match untuk `/api/be` POST |
| Path allowlist | Unknown `/api/*` → deny; BE path harus match `bePathAllowlist.ts` |
| Rate limit | Login 8/15min (prod), BE proxy 180 POST/min/IP |
| IP allowlist | Optional via `IP_ALLOWLIST` env |
| CSP | Nonce-based prod CSP via `csp.ts` |
| Prod session mode | `NEXT_PUBLIC_USE_BACKEND_SESSION` wajib — else 503 |

```bash
node capex-apps/scripts/verify-middleware-security.mjs
```

---

## Layer 2 — BFF

**Files:** `bePathAllowlist.ts`, `beProxy.ts`, `edgeApiPolicy.ts`

- POST-only ke `/api/be` — no GET data leakage via URL/cache
- Path traversal blocked (`..`, encoded dots)
- Session cookies forwarded server-side (httpOnly, never exposed to JS)
- Auto token refresh before forward jika access JWT expired

**Build-time scan:**

```bash
cd capex-apps && npm run build:secure
# Blocks Supabase keys, GEMINI keys in client bundle
```

---

## Layer 3 — Backend API

**File:** `capexbe/src/app.module.ts`

Guard execution order:

```
ThrottlerGuard (400/min, Redis-backed)
  → JwtAuthGuard (JWT + session active check)
    → RolesGuard (@Roles decorator)
      → PermissionsGuard (@RequirePermission decorator)
```

### Auth hardening (baru)

| Service | File |
|---------|------|
| Account lockout | `auth-account-lockout.service.ts` |
| Rate limiter | `auth-rate-limiter.service.ts` |
| Session rotation | `session.service.ts` |
| Request context | `auth-request-context.ts` |

**Session properties:**
- httpOnly + `SameSite=Strict` + `Secure` (prod)
- Refresh token rotation with family tracking
- Reuse detection → revoke entire session family
- Idle timeout (3h) + tab-hidden logout
- Password login **disabled in production**

### Service-layer AuthZ (complete mediation)

High-risk operations punya **double check** — guard + service:

```bash
cd capexbe && npm run verify:service-authz
# Checks: backup, smart-migration, user-admin, fs-update, configuration
```

---

## Layer 4 — Data egress (PII)

**Files:** `response-sanitize.util.ts`, `pii-access.util.ts`, `bootstrap-sanitize.util.ts`

```
API response
  → viewerCanSeeUserPii(viewer, targetUser)?
    → YES: full fields (self, admin, User Management role)
    → NO:  maskEmail, maskPhone, strip internal fields
```

Bootstrap init pack return **self user only**. Full directory via lazy `/bootstrap/users-directory` dengan PII gate.

Login audit: `maskEmail()` before insert ke `login_audit_logs`.

---

## Layer 5 — Database (RLS)

**Migrations:** `capex-apps/supabase/migrations/20260721*.sql`, `20260723100000`

Steady state:

```
anon role         → blocked from all CAPEX tables
authenticated role → blocked from direct SELECT (must go through BE)
service_role      → used by capexbe with application-layer AuthZ
```

Append-only audit:

```sql
-- 20260723100000_audit_logs_append_only.sql
-- Trigger blocks UPDATE/DELETE on audit_logs, login_audit_logs
```

BE aligned: `audit.service.ts` uses `.insert()` only — no upsert.

---

## Automated verification suite

```bash
cd capexbe && npm run verify:security
```

Runs 6 checks:
- `verify:pii-sanitization` — sanitizers wired on egress paths
- `verify:be-routes` — FE/BE allowlist sync
- `verify:endpoint-permissions` — controllers have permission decorators
- `verify:service-authz` — high-risk services check AuthZ
- `verify:query-safety` — no raw SQL
- `verify:fs-schema` — column alignment

---

## Score breakdown

| Layer | Score | Notes |
|-------|-------|-------|
| L2 Access Control | 9.0 | Guards + lockout + session rotation |
| L3 Application | 9.0 | Throttle, CSP, allowlist, CSRF |
| L4 Data Protection | 7.8 | PII masking; no field encryption at-rest |
| L5 Audit | 8.8 | Append-only migration + insert-only code |
| L1 Network | 6.0 | nginx/Cloudflare template ready, ops manual |

---

## Remaining security debt

| Priority | Item |
|----------|------|
| P1 | Wire CSP nonce ke root layout `<Script>` tags |
| P2 | Sanitize before `perfCacheSet` (don't cache raw PII in Redis) |
| P2 | Generic error messages in prod (wrap Supabase errors) |
| P3 | Turnstile/CAPTCHA on login |
| P3 | Distributed edge rate limit (currently in-process) |

---

[Lihat README](./README.md) · [Architecture](./ARCHITECTURE.md) · [Auth & Session](./AUTH-SESSION.md)
