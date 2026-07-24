# Auth & Session

Session management dan authentication flow setelah remediasi.

---

## Inherited problems

- Token bisa di-hold di browser memory (localStorage/sessionStorage)
- Tidak ada brute-force protection
- Refresh token tidak di-rotate
- Session tidak di-revoke server-side
- Auth rate limit tidak per-action

---

## Target model: httpOnly BFF session

```
Browser                    Next.js BFF                 capexbe
  │                            │                          │
  │── POST /api/auth/login ────→│── forward ──────────────→│ verify credentials
  │                            │← Set-Cookie: session ────│ create session row
  │← httpOnly cookies ────────│                          │
  │                            │                          │
  │── POST /api/be/bootstrap ─→│── Cookie + CSRF ────────→│ JwtAuthGuard
  │                            │                          │ assertSessionActive()
  │← JSON data ───────────────│← JSON ───────────────────│
```

**Browser tidak pernah hold Bearer token.** `getAccessTokenForBackend()` return `null` di client.

---

## Cookie layout

| Cookie | httpOnly | Purpose |
|--------|----------|---------|
| Session access | Yes | Short-lived JWT |
| Session refresh | Yes | Opaque refresh token |
| CSRF token | **No** | Double-submit pattern (JS must read it) |

Prod flags: `Secure`, `SameSite=Strict`

**File:** `capex-apps/src/lib/auth/authCookies.server.ts`

---

## Login flow

```
1. POST /api/auth/login { email, password }
2. middleware rate limit check (8/15min prod)
3. BE auth-rate-limiter.assertAllowed('login')
4. BE auth-account-lockout.assertNotLocked(email, ip)
5. Verify credentials (Supabase auth or Azure SSO)
6. session.service.createSession() → DB row + refresh family
7. Set httpOnly cookies via BFF
8. auth-audit.service.logLogin() (opt-in, email masked)
```

Password login **disabled in production** (`isPasswordLoginDisabled()`).

---

## Refresh & rotation

```typescript
// session.service.ts
// On refresh:
// 1. Verify refresh token hash matches DB
// 2. Check session family not revoked
// 3. Issue new access JWT + new refresh token
// 4. Invalidate old refresh token (rotation)
// 5. If reused token detected → revoke entire family (reuse attack)
```

FE coordination:

```typescript
// authRefreshCoordinator.ts — cross-tab lock via localStorage
// capexBeAxios.ts — 401 interceptor triggers refresh, max 1 retry
// AuthSessionSync.tsx — periodic refresh + heartbeat + idle timeout
```

---

## Session lifecycle (client)

| Event | Action |
|-------|--------|
| Login success | Start refresh timer, broadcast to tabs |
| Tab hidden 30min | Trigger logout |
| User idle 3h | Trigger logout |
| 401 from BE | Coordinated refresh attempt |
| Refresh fail | Clear cookies, redirect login |
| Session expiry warning | `SessionExpiryWarning.tsx` — extend option |

---

## Account lockout

```typescript
// auth-account-lockout.service.ts
// Track failures per email+IP via perfCacheIncrement
// Threshold: 5 failures in 15 min window → lock 15 min
// Cleared on successful login

// Env:
AUTH_LOCKOUT_MAX_FAILURES=5
AUTH_LOCKOUT_WINDOW_MS=900000
AUTH_LOCKOUT_MS=900000
```

Backed by Redis when available, memory fallback per-process.

---

## Permission model

```
user_assignments → roles → role_permissions → hierarchy matrix
```

| Layer | Check | Authoritative? |
|-------|-------|---------------|
| FE `usePermissions` | UI hide/show buttons | No (UX only) |
| BE `PermissionsGuard` | `@RequirePermission('Budget', 'view')` | **Yes** |
| BE service layer | `authZ.assertHierarchyPermission()` | **Yes (high-risk ops)** |

Super-admin bypass centralized in guards — not scattered per endpoint.

---

## Azure SSO

Routes: `/api/auth/azure/start`, `/api/auth/azure/callback`

- OAuth state validation
- `returnTo` sanitized against open redirect (`oauthReturnTo.ts`)
- Exchange code → session cookies (same as password flow)

---

## Debugging auth issues

| Symptom | Check |
|---------|-------|
| 503 on all routes | `NEXT_PUBLIC_USE_BACKEND_SESSION` not set in prod |
| 401 loop | Refresh cookie expired; check `auth_sessions` table |
| 403 on BE call | Permission missing — check `user_assignments` + role matrix |
| CSRF mismatch | Cookie not sent; check SameSite + proxy headers |
| Lockout | Redis key `auth:lockout:{email}:{ip}` or wait 15 min |

---

[Lihat README](./README.md) · [Security](./SECURITY.md) · [Architecture](./ARCHITECTURE.md)
