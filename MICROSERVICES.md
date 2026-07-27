# Microservices migration (strangler fig)

Phased path from **modular monolith** → **8–10 deployable services** without big-bang rewrite.

**Principle:** BFF stays the API gateway. Extract one leaf domain at a time. Shared Supabase DB until Phase 4.

---

## Current state (Phase 0 — done)

```
Browser → POST /api/be/{path}
       → middleware (session, CSRF, allowlist)
       → beProxy.ts
            ├─ default: NEXT_PUBLIC_CAPEXBE_URL  (all traffic today)
            └─ optional override per prefix:
                 notifications/* → CAPEX_SERVICE_NOTIFICATIONS_URL
                 audit/*         → CAPEX_SERVICE_AUDIT_URL
                 backup/*        → CAPEX_SERVICE_BACKUP_URL
```

**Prod impact today: zero.** Overrides only apply when env vars are set.

Verify:

```bash
cd capex-apps && node scripts/verify-service-routes.mjs
```

---

## Phase map

| Phase | Goal | Duration (1 senior) | Prod risk |
|-------|------|---------------------|-----------|
| **0** | BFF prefix routing | ✅ Done | None |
| **1** | Extract **notifications** service | ✅ Scaffolded — shadow test next | Low |
| **2** | Extract **audit** + **backup** | 2–3 weeks | Low |
| **3** | Shared `@capex/auth-core` npm package | 3–4 weeks | Medium |
| **4** | Extract **config** service | 4–6 weeks | Medium |
| **5** | Extract **procurement** (PO + GR) | 4–6 weeks | Medium |
| **6** | Extract **fs** cluster (4 modules) | 6–8 weeks | High |
| **7** | Split **projects** + **tasks** + **budget** | 12+ weeks | Very high |
| **8** | DB schema ownership / events (optional) | 16+ weeks | Very high |

**Do not skip Phase 3** — every service needs JWT validation + RLS client factory.

---

## Phase 1 — Notifications (first real service)

### Why notifications first?

- 153 LOC module, 4 endpoints
- Single table: `notifications`
- Depends on `AuthContextService` + `AuthZService` only (no project-list hub)

### Steps

1. **Create** `services/capex-notifications/` — minimal NestJS app:
   - Copy `notifications.controller.ts` + `notifications.service.ts`
   - Import auth guards from `@capex/auth-core` (Phase 3) **or** duplicate slim auth middleware temporarily

2. **Docker** — new container port `3002`, same env as capexbe (Supabase, JWT secret)

3. **Wire BFF** — set in prod/staging:
   ```env
   CAPEX_SERVICE_NOTIFICATIONS_URL=http://capex-notifications:3002
   ```

4. **Remove** `NotificationsModule` from monolith **only after** shadow traffic test passes

5. **Rollback** — unset env var → traffic back to monolith instantly

### Shadow test (before cutover)

```bash
# Terminal 1: run extracted service
cd services/capex-notifications && npm run start:dev

# Terminal 2: point BFF at it locally
CAPEX_SERVICE_NOTIFICATIONS_URL=http://127.0.0.1:3002 npm run dev
```

Smoke: My Tasks → notifications bell → list / mark-read.

---

## Phase 3 — Shared auth package (required before more splits)

Extract from `capexbe/src/auth/` into `packages/capex-auth-core/`:

| Export | Used by every service |
|--------|----------------------|
| `JwtAuthGuard` | Validate `capex_access` JWT |
| `PermissionsGuard` | `@RequirePermission` |
| `AuthContextService.getRlsClient()` | Supabase RLS client |
| `AuthZService` | Hierarchy permission checks |

Monolith and leaf services both depend on this package — **no copy-paste guards**.

---

## Service boundary target (end state)

```
                    ┌─────────────────┐
                    │  capex-web BFF  │  ← API gateway (existing)
                    └────────┬────────┘
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
  capex-core-api      capex-notifications   capex-audit
  (auth,bootstrap,     (leaf)                (leaf)
   projects,tasks,
   budget,fs,po,gr,
   config,reporting)
         │
         ▼
   Supabase Postgres (shared → later schema-per-service)
```

**8 deployables**, not 26 (one controller ≠ one microservice).

---

## Rules during migration

1. **Never break allowlist sync** — new service prefix must exist in `bePathAllowlist.ts` + `verify:be-routes`
2. **Auth stays on core** — `/auth/*` never routed to leaf services
3. **One service per PR** — extract + shadow test + cutover + rollback doc
4. **Monolith stays default** — env override is opt-in until cutover confirmed
5. **No DB split until Phase 8** — shared Supabase, logical ownership only

---

## Env reference (BFF / capex-apps)

```env
# Default — all traffic (required)
NEXT_PUBLIC_CAPEXBE_URL=http://localhost:3001

# Phase 1+ — optional leaf service origins (server-only, no NEXT_PUBLIC_)
# CAPEX_SERVICE_NOTIFICATIONS_URL=http://127.0.0.1:3002
# CAPEX_SERVICE_AUDIT_URL=http://127.0.0.1:3003
# CAPEX_SERVICE_BACKUP_URL=http://127.0.0.1:3004
```

---

## Next action (you)

| # | Task | Owner |
|---|------|-------|
| 1 | Run `verify-service-routes.mjs` | Now |
| 2 | Scaffold `services/capex-notifications/` from monolith module | Phase 1 week 1 |
| 3 | Extract `@capex/auth-core` package | Phase 3 |
| 4 | Present Phase 0–2 timeline to IT (~6 weeks, 1 leaf live) | Stakeholder |

---

See also: [ARCHITECTURE.md](./ARCHITECTURE.md) · [DEPLOY.md](./DEPLOY.md)
