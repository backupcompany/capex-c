# CAPEX v2

Monorepo aplikasi **Capital Expenditure (CAPEX)** untuk perencanaan, approval, dan tracking budget capex per hospital unit, archetype, dan periode fiskal.

| | |
|---|---|
| **Repo** | [`backupcompany/capex-c`](https://github.com/backupcompany/capex-c) |
| **Branch** | `main` |
| **Stack** | Next.js 16 · NestJS · Supabase Postgres · Redis (optional) |
| **Remediation** | 22–23 Juli 2026 |

---

## Konteks Project

Codebase ini **diwarisi** — bukan greenfield. Versi sebelumnya dikembangkan tanpa separation of concerns yang jelas: monolith frontend, keamanan tidak konsisten, full-dataset fetch, dan beberapa React anti-pattern. Issue keamanan dan stabilitas cukup serius untuk di-remediasi sebelum masuk repo produksi.

Pada **22–23 Juli 2026** dilakukan **remediation sprint** end-to-end:

- Hardening keamanan (BFF, guards, RLS, PII egress)
- Refactor arsitektur frontend (app shell modular)
- Optimasi data loading (disk hydrate → cache → paginated BE loaders)
- Stabilisasi dev environment (Turbopack monorepo, Redis circuit breaker)
- Konsolidasi repo (git history, `.gitignore` env, hapus internal audit docs)

| Metrik | Inherited (est.) | Setelah remediasi |
|--------|------------------|-------------------|
| Security overall | ~5.5 / 10 | **7.6 / 10** |
| L2 Access Control | — | 9.0 |
| L3 Application | — | 9.0 |
| L4 Data Protection | — | 7.8 |
| FE architecture | Monolith `App.tsx` ~1800 baris | Modular app shell |
| Data path | Risiko direct Supabase dari browser | BFF-only `/api/be` |
| BE data fetch | Full dataset per request | Paginated + cache-aside |

Dokumen pendalam per topik: [ARCHITECTURE.md](./ARCHITECTURE.md) · [SECURITY.md](./SECURITY.md) · [DATA-LOADING.md](./DATA-LOADING.md) · [AUTH-SESSION.md](./AUTH-SESSION.md) · [DEPLOY.md](./DEPLOY.md)

---

## Quick Start

```bash
make setup          # copy .env.example → .env, npm install (root + BE + FE)
make check          # validasi env + ping Supabase
make run            # backend :3001 + frontend :3000
```

| App | Folder | Port dev | Fungsi |
|-----|--------|----------|--------|
| Frontend + BFF | `capex-apps/` | 3000 | UI React + edge middleware + `/api/be` proxy |
| Backend API | `capexbe/` | 3001 | NestJS REST API, AuthZ, DB access |
| Redis | `make redis-up` | 6379 | perf-cache, throttling, account lockout (opsional lokal) |

**Env wajib:**

```bash
# capexbe/.env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...    # server-only, NEVER NEXT_PUBLIC_*
JWT_ACCESS_SECRET=...            # same value di FE untuk edge verify

# capex-apps/.env.local
NEXT_PUBLIC_CAPEXBE_URL=http://localhost:3001
NEXT_PUBLIC_USE_BACKEND_SESSION=1
```

File `.env` **tidak pernah** di-commit. Hanya `.env.example` yang ada di repo.

**Verify sebelum release:**

```bash
cd capexbe && npm run verify:security
cd capex-apps && node scripts/verify-middleware-security.mjs
cd capex-apps && npm run build:secure
```

---

## Arsitektur & Request Flow

```
Browser (React + TanStack Query)
  │
  ├─ POST /api/auth/login          → session cookies (httpOnly)
  │
  └─ POST /api/be/{path}           → data API (same-origin BFF)
       │
       ├─ middleware.ts            → session JWT, CSRF, rate limit, CSP
       ├─ beProxy.ts               → forward cookies, auto refresh token
       └─ capexbe NestJS
            ├─ ThrottlerGuard      → 400 req/min
            ├─ JwtAuthGuard         → JWT + session active
            ├─ RolesGuard           → @Roles()
            ├─ PermissionsGuard     → @RequirePermission()
            └─ Service + Loader     → Supabase (service_role + AuthZ)
```

### Invariant arsitektur

1. Browser **tidak pernah** memanggil Supabase PostgREST langsung.
2. **AuthZ authoritative di `capexbe`** — permission check di FE hanya UX.
3. Data loading **progressive**: disk snapshot → React Query cache → background prefetch.
4. BE pakai `service_role` (bypass RLS) — setiap endpoint wajib `@RequirePermission`.

---

## Frontend — App Shell Refactor

Inherited: semua routing, state, prefetch, dan permission logic ada di satu file `App.tsx`. Sulit maintain, setiap edit berisiko regression lintas screen.

### Komponen yang dibangun

| File | Fungsi utama |
|------|-------------|
| `src/components/app-shell/AppRouteRenderer.tsx` | Switch `Page` enum → lazy screen component + access gate |
| `src/hooks/useRouteWarm.ts` | Orchestrate disk hydrate + network prefetch saat navigasi |
| `src/hooks/usePagePreloads.ts` | Sync read localStorage snapshot untuk route aktif |
| `src/lib/navigation/routeWarmPolicy.ts` | Central policy: screen mana di-hydrate/prefetch |
| `src/hooks/useNavPrefetch.ts` | Sidebar hover → debounced prefetch |
| `src/lib/navigation/unsavedChangesGuard.ts` | Block navigasi jika ada unsaved edits |
| `src/screens/registry.tsx` | Lazy dynamic import per screen (code splitting) |

### `hydrateRouteDisk()` — instant first paint

Dipanggil via `useLayoutEffect` **sebelum paint**. Baca localStorage snapshot dan seed TanStack Query cache:

```typescript
// capex-apps/src/lib/navigation/routeWarmPolicy.ts
export function hydrateRouteDisk(ctx: RouteWarmContext): void {
  switch (ctx.routePage) {
    case Page.POUpdate:
      hydratePoUpdatePageFromDisk(queryClient, uid, periodName);
      break;
    case Page.FSUpdate:
      hydrateFsUpdatePageFromDisk(queryClient, periodName, uid);
      break;
    case Page.MyTask:
      hydrateMyTasksFromDisk(queryClient, uid);
      break;
    // ... BudgetHU, CPL, BDD, Configuration, FS Approval, dll.
  }
}
```

User melihat data **segera** dari disk — network fetch jalan di background tanpa blocking UI.

### `prefetchRouteNetwork()` — background refresh

Dipanggil via `useEffect` **setelah paint**. Fetch data fresh dari BE jika cache stale:

```typescript
// capex-apps/src/lib/navigation/routeWarmPolicy.ts
export function prefetchRouteNetwork(ctx: RouteWarmContext): void {
  scheduleRouteNetworkPrefetch(`po:${uid}:${periodName}`, () =>
    prefetchPoUpdatePage(queryClient, uid, periodName),
  );
  // Debounced via prefetchGate.ts — max 2 concurrent prefetches per tab
}
```

### `AppRouteRenderer` — routing + access gate

```typescript
// capex-apps/src/components/app-shell/AppRouteRenderer.tsx
// Gate 1: shellPermissionsReady → skeleton (tunggu bootstrap + roles)
// Gate 2: permissions.canAccessPage(routePage) → access denied UI
// Pass pagePreloads ke screen: preloadedTasks, preloadedSnapshot, dll.
switch (routePage) {
  case Page.POUpdate:
    return <LazyPOUpdatePage preloadedSnapshot={pagePreloads.poUpdate} ... />;
  case Page.MyTask:
    return <LazyMyTaskPage preloadedTasks={pagePreloads.myTasks} ... />;
}
```

---

## Frontend — BFF & HTTP Client

### `postToCapexBe()` — single data path

Browser **selalu** same-origin. Tidak pernah direct ke BE URL publik:

```typescript
// capex-apps/src/lib/capexBeClient.ts
// Browser: POST /api/be/bootstrap, /api/be/my-tasks/page, dll.
// Server-side (SSR): boleh direct ke CAPEXBE_URL
export async function postToCapexBe<T>(path: string, body: unknown, opts?: PostOpts): Promise<T>
```

### `isAllowedBePath()` — open-proxy protection

Setiap request `/api/be/{path}` divalidasi against explicit prefix list:

```typescript
// capex-apps/src/lib/auth/bePathAllowlist.ts
export function isAllowedBePath(path: string): boolean {
  // Reject traversal: .., \, encoded dots
  // Match against ALLOWED_PATH_PREFIXES: bootstrap, my-tasks/, fs-update/, po-update/, dll.
}
```

Sync dengan BE: `capexbe/src/shared/be-route-allowlist.util.ts` — divergen = 404 di prod. Dicek otomatis via `npm run verify:be-routes`.

### `capexBeAxios` — HTTP interceptors

```typescript
// capex-apps/src/lib/http/capexBeAxios.ts
// Request interceptor:  attach CSRF header (X-CSRF-Token)
// Response interceptor: 401 → coordinated refresh (authRefreshCoordinator.ts)
//                        503 → retry with jitter (BE warming up)
```

### Edge middleware

```typescript
// capex-apps/middleware.ts
// Layer 1 ONLY — AuthZ di capexbe, bukan di sini
// ✓ resolveEdgeSession() — JWT verify via jose
// ✓ validateBeProxyRequest() — POST only, CSRF match, path allowlist
// ✓ rate limit auth routes (login 8/15min prod)
// ✓ rate limit /api/be POST (180/min/IP)
// ✓ IP allowlist (IP_ALLOWLIST env, optional)
// ✓ CSP nonce generation (production) via csp.ts
// ✓ require backend session in prod (503 if NEXT_PUBLIC_USE_BACKEND_SESSION off)
```

---

## Frontend — Data Loading per Screen

Pattern standar screen berat:

```
usePagePreloads (sync disk read)
  → useQuery (initialData dari disk, staleTime 120s, refetchOnMount false)
    → useRouteWarm (background network prefetch)
      → queryDehydrate (persist ke localStorage, exclude heavy infinite queries)
```

| Screen | Hook / fetcher | BE endpoint | Catatan |
|--------|---------------|-------------|---------|
| **My Tasks** | `useMyTasksScreenQuery`, `useMyTasksInfiniteList` | `my-tasks/page` | Server pagination + infinite pilot (max 5 pages) |
| **FS Update** | `useFsUpdateMetaQuery`, `useFsUpdateTableQuery` | `fs-update/meta`, `fs-update/query` | Split meta + table, 20 rows/page |
| **GR Update** | `fetchGrUpdatePageData` | `gr-update/page-bundle` | Zod validate via `grUpdate.schema.ts` |
| **PO Update** | `fetchPoUpdatePageData` | `po-update/page-bundle` | Disk snapshot + dirty state fix |
| **Budget HU** | `useBudgetHuPagePipeline` | `budget-hu/page-bundle` | Projects lazy via `budget-hu/projects-page` |
| **Multi-Year** | `fetchBudgetMultiYearPageBundle` | `budget-multi-year/page-bundle` | Period budgets lazy on row expand |
| **CPL** | `useProjectListTablePipeline` | `project-list/assets-query` | Virtual window + disk cache |
| **BDD** | `useBddConstructionTablePipeline` | `project-list/bdd-construction` | Disk pipeline |

### React Query defaults

```typescript
// capex-apps/src/providers/AppProviders.tsx
staleTime: 120_000,        // 2 min — don't refetch if fresh
gcTime: 24 * 60 * 60_000,  // 24h in memory
refetchOnMount: false,
networkMode: 'offlineFirst',
// Persisted: localStorage key 'capex.tanstack-query.v1'
// Excluded: infinite queries, heavy paginated tables (queryDehydrate.ts)
```

### Zod response validation

```typescript
// capex-apps/src/lib/validation/parseApiResponse.ts
parseApiResponseOrFallback(schema, data, fallback)
// Corrupt rows di-drop, bukan whole page crash

// Schemas: myTasks.schema.ts, grUpdate.schema.ts
// Dipakai di: myTasksApi.ts, grUpdateApi.ts
```

---

## Frontend — Bug Fix: PO Update Dirty State

**Inherited bug:** `setIsPageDirty()` dipanggil di dalam `setEditedData` updater → React error *"Cannot update App while rendering POUpdatePage"*.

**Fix:** derive `isDirty` via `useMemo`, sync parent via `useEffect`:

```typescript
// capex-apps/src/screens/POUpdatePage/POUpdatePage.tsx
const isDirty = useMemo(() => {
  if (editedData.length === 0) return false;
  const prepared = preparePoAssetsForSave(serverAssetsRef.current, editedData);
  return diffChangedPoAssets(serverAssetsRef.current, prepared).length > 0;
}, [editedData]);

useEffect(() => {
  setIsPageDirty(isDirty);
}, [isDirty, setIsPageDirty]);
```

Pattern ini jadi **referensi** untuk screen serupa (GR Update masih pattern lama — apply fix yang sama jika error muncul).

---

## Backend — Guard Stack & Auth

### Global guards (execution order)

```typescript
// capexbe/src/app.module.ts
ThrottlerGuard       // 400 req/min, RedisThrottlerStorage
  → JwtAuthGuard      // JWT verify + session.assertSessionActive()
    → RolesGuard      // @Roles('super_admin', 'pmo', ...)
      → PermissionsGuard  // @RequirePermission('Budget', 'view')
```

### Auth services (baru di remediasi)

| Service | File | Fungsi |
|---------|------|--------|
| Account lockout | `auth-account-lockout.service.ts` | `assertNotLocked()`, `recordFailure()`, `clearFailures()` — 5x/15min per email+IP |
| Rate limiter | `auth-rate-limiter.service.ts` | `assertAllowed(action)` — per-action sliding window (login, refresh, forgot_password) |
| Session | `session.service.ts` | `createSession()`, refresh rotation, family revocation on reuse |
| Request context | `auth-request-context.ts` | `AsyncLocalStorage<ResolvedAuthContext>` — no double token resolve per request |

### Session flow

```
POST /auth/login
  → verify credentials
  → session.service.createSession() → DB row + refresh family
  → Set httpOnly cookies (access + refresh)
  → CSRF cookie (non-httpOnly, for double-submit)

POST /auth/refresh
  → verify refresh token hash
  → rotate: new access + new refresh, invalidate old
  → reuse detection → revoke entire session family
```

Detail: [AUTH-SESSION.md](./AUTH-SESSION.md)

---

## Backend — Paginated Loaders

Menggantikan inherited full-dataset fetch. Pattern: **DB query → cache-aside → PII sanitize on egress**.

| Domain | Loader | Service method | Cache key |
|--------|--------|---------------|-----------|
| My Tasks | `my-tasks-page.loader.ts` | `loadPage()` | `app:table:my-tasks:page:{uid}` |
| My Tasks query | `my-tasks-query.ts` | `queryPage()` | filter/sort/page on cached snapshot |
| FS Update meta | `fs-update-meta.loader.ts` | `loadMeta()` | counts, approval stats |
| FS Update table | `fs-update-projects-page.loader.ts` | `loadQuery()` | paginated projects, 20/page |
| GR Update | `gr-update-page.loader.ts` | `loadPageBundle()` | full asset bundle |
| Budget HU projects | `budget-hu-projects-page.loader.ts` | `loadHuStrategicProjectsPage()` | paginated per HU |

```typescript
// capexbe/src/shared/cache-aside.service.ts
async get(key, loader, ttlMs) {
  // 1. Process memory hit
  // 2. Redis hit (perf-cache)
  // 3. Distributed lock → loader() → set cache
  // 4. Return sanitized egress
}
```

### `perf-cache.ts` — Redis + circuit breaker

Inherited: Redis down → reconnect loop → `ClientClosedError` → BE crash + request hang 10–22 detik.

```typescript
// capexbe/src/shared/perf-cache.ts
shouldSkipRedis()          // circuit breaker: skip 60s after connect failure
safeCloseRedis(client)     // check isOpen before destroy — no throw on closed client
perfCacheGet(key)          // L1 memory → L2 Redis → null
perfCacheSet(key, val, ttl)// write both layers
perfCacheIncrement(key)    // atomic counter — used by lockout + rate limit
logRedisErrorOnce()        // max 1 log per 30s — no spam
```

Tanpa `REDIS_URL`: memory-only fallback (single-instance, masih functional).

---

## Backend — PII Egress Pipeline

Inherited: bootstrap return all users dengan email/phone full ke client.

```typescript
// capexbe/src/shared/response-sanitize.util.ts
sanitizeUserForDirectory(user, viewer)
  → viewerCanSeeUserPii(viewer, target) ? full fields : maskEmail/maskPhone

// capexbe/src/bootstrap/bootstrap.service.ts
loadInitPack()  → return self user ONLY
loadUsersDirectory()  → lazy, permission-gated, PII masked

// capexbe/src/auth/auth-audit.service.ts
logLogin()  → maskEmail(email) before insert login_audit_logs
```

---

## SQL Migrations (Supabase)

Apply **berurutan** di production:

| Migration | Fungsi |
|-----------|--------|
| `20260721120000_security_rls_hardening.sql` | Block anon policies on sensitive tables |
| `20260721140000_capex_security_foundation.sql` | Harden `set_current_user_id()`, deny anon grants |
| `20260721160000_capex_security_phase2_lock_authenticated.sql` | Block direct PostgREST as `authenticated` |
| `20260721190000_capex_security_restore_steady_state.sql` | Idempotent re-apply phases 1+2 |
| `20260722100000_capex_security_revoke_authenticated_rpc.sql` | Revoke context RPCs from `authenticated` |
| `20260722220000_assets_add_cpr_id.sql` | Add `assets.cpr_id`, `assets.po_date` |
| `20260723100000_audit_logs_append_only.sql` | Trigger block UPDATE/DELETE on audit tables |

Steady state:

```
Browser ✗ PostgREST (anon + authenticated blocked)
Browser → /api/be → capexbe (service_role + AuthZ) → Postgres
```

BE aligned: `audit.service.ts` uses `.insert()` only — no upsert on audit_logs.

Detail deploy: [DEPLOY.md](./DEPLOY.md)

---

## Dev Environment Fixes

### Turbopack monorepo (inherited bug)

**Symptom:** Login page logo SVG raksasa, Tailwind tidak load.

**Cause:** Turbopack resolve `tailwindcss` dari repo root, bukan `capex-apps/node_modules/`.

**Fix:**

```typescript
// capex-apps/next.config.ts
const monorepoRoot = path.join(appRoot, '..');
turbopack: { root: monorepoRoot },
outputFileTracingRoot: monorepoRoot,
```

Root `package.json` menambahkan `tailwindcss` + `@tailwindcss/postcss` devDependency.

### My Tasks CanceledError

**Symptom:** Console spam `CanceledError: canceled` saat navigasi cepat.

**Fix:** `fetchMyTasksPage.ts` — rethrow tanpa log jika `isAxiosCanceled(err)`.

### Build pipeline (BE)

```
npm run build = tsc --noEmit (TypeScript 7 typecheck)
              + nest build (SWC compile via TS 6 shim)
```

File: `.swcrc`, `scripts/patch-nest-typescript6.mjs`

---

## Repo Structure

```
capex/
├── README.md                         ← kamu di sini
├── ARCHITECTURE.md                   ← deep dive arsitektur
├── SECURITY.md                       ← defense-in-depth detail
├── DATA-LOADING.md                   ← cache & loading per screen
├── AUTH-SESSION.md                   ← session flow detail
├── DEPLOY.md                         ← prod checklist
├── Makefile                          ← make setup/run/check/stop
├── package.json                      ← monorepo root (tailwindcss)
├── capex-apps/                       ← Next.js FE + BFF
│   ├── middleware.ts                 ← edge security Layer 1
│   ├── next.config.ts                ← turbopack monorepo root
│   ├── app/api/be/[...path]/route.ts ← BFF catch-all proxy
│   ├── app/api/auth/*/route.ts       ← auth BFF routes
│   └── src/
│       ├── App.tsx                   ← shell orchestrator
│       ├── components/app-shell/     ← AppRouteRenderer
│       ├── hooks/                    ← useRouteWarm, usePagePreloads, queries
│       ├── lib/
│       │   ├── navigation/           ← routeWarmPolicy, unsavedChangesGuard
│       │   ├── auth/                 ← bePathAllowlist, beProxy, edgeSession
│       │   ├── security/csp.ts       ← CSP builder
│       │   ├── http/capexBeAxios.ts  ← axios interceptors
│       │   └── validation/           ← Zod schemas + parseApiResponse
│       └── screens/                  ← PO, GR, FS, MyTask, Budget*, CPL, BDD
├── capexbe/                          ← NestJS API
│   ├── src/
│   │   ├── main.ts                   ← helmet, CORS, allowlist middleware
│   │   ├── app.module.ts             ← global guards + throttler
│   │   ├── auth/                     ← session, lockout, guards
│   │   ├── my-tasks/                 ← paginated loaders
│   │   ├── fs-update/                ← meta + table loaders
│   │   ├── gr-update/                 ← page bundle loader
│   │   ├── budget-hu/                ← page + projects loader
│   │   ├── backup/                   ← export/import module
│   │   └── shared/
│   │       ├── perf-cache.ts         ← Redis + circuit breaker
│   │       ├── cache-aside.service.ts
│   │       ├── response-sanitize.util.ts
│   │       └── cache-keys.ts         ← TTL constants
│   └── scripts/verify-*.mjs          ← security static audits
├── capex-apps/supabase/migrations/   ← RLS + schema migrations
└── deploy/                           ← nginx template, docker compose
```

---

## Remaining Debt

| Priority | Item | File terkait |
|----------|------|-------------|
| P1 | CSP nonce belum wired ke root layout | `app/layout.tsx`, `csp.ts` |
| P1 | GR Update dirty state pattern lama | `GRUpdatePage.tsx` — copy POUpdatePage pattern |
| P2 | Zod validation hanya My Tasks + GR | expand ke screen lain |
| P2 | Edge rate limit in-memory (non-distributed) | `edgeRateLimit.ts` |
| P2 | Redis cache pre-sanitized PII | sanitize before `perfCacheSet` |
| P3 | No CAPTCHA/Turnstile on login | `/api/auth/login` |
| P3 | Page unmount → expand state hilang | Multi-Year Budget |

---

## Maintenance Guidelines

1. **Data access hanya via `/api/be`** — jangan expose Supabase ke browser, jangan tambah `NEXT_PUBLIC_SUPABASE_*`.
2. **AuthZ di BE = security boundary** — `@RequirePermission` di controller + service-layer check untuk ops high-risk.
3. **Screen baru** ikuti pattern: disk cache → React Query → route warm policy → BE loader dengan cache-aside.
4. **Path baru di BE** wajib tambah ke `bePathAllowlist.ts` + `be-route-allowlist.util.ts` + run `verify:be-routes`.
5. **`npm run verify:security`** sebelum setiap release.
6. **Apply DB migrations** sebelum deploy production.
7. **Dirty state pattern** — derive state + `useEffect` sync, jangan panggil parent setState di dalam updater function.

---

*Remediation sprint: 22–23 Juli 2026 · [`backupcompany/capex-c`](https://github.com/backupcompany/capex-c)*
