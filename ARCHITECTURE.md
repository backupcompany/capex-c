# Architecture

Penjelasan arsitektur CAPEX v2 setelah remediasi 22–23 Juli 2026.

---

## Problem inherited

Codebase original punya beberapa anti-pattern arsitektural:

- **`App.tsx` monolith** (~1800 baris) — routing, state, prefetch, permission, period selection semua dalam satu file. Sulit di-test, sulit di-debug, dan setiap perubahan berisiko regression silang-screen.
- **Client-side data access** — beberapa service masih bisa resolve Supabase dari browser. Ini membuka attack surface: anon key exposure, bypass AuthZ FE, dan impossible audit trail.
- **Eager loading** — setiap navigasi trigger full fetch. User merasa app "reload" meski cuma pindah tab.

Remediasi fokus ke **separation of concerns** dan **single data path**.

---

## Target architecture

```
Browser
  └─ React screens (lazy-loaded via registry)
       └─ TanStack Query (cache + disk hydrate)
            └─ POST /api/be/{path}          ← same-origin BFF
                 └─ middleware.ts           ← session, CSRF, rate limit, CSP
                      └─ beProxy.ts         ← forward cookies, refresh token
                           └─ capexbe       ← Guards + AuthZ + loaders
                                └─ Supabase Postgres (RLS hardened)
```

**Invariant:** tidak ada path dari browser ke Supabase PostgREST. Semua data lewat BFF → BE.

---

## App shell refactor

Monolith `App.tsx` dipecah menjadi layer terpisah:

| Layer | File | Responsibility |
|-------|------|----------------|
| Orchestrator | `src/App.tsx` | Bootstrap, period selection, shell state, render `<AppRouteRenderer />` |
| Router | `src/components/app-shell/AppRouteRenderer.tsx` | Map `Page` enum → lazy screen component |
| Warm | `src/hooks/useRouteWarm.ts` | Disk hydrate (layout effect) + network prefetch (effect) |
| Preload | `src/hooks/usePagePreloads.ts` | Sync read localStorage snapshot untuk route aktif |
| Policy | `src/lib/navigation/routeWarmPolicy.ts` | Per-screen warm/hydrate rules |
| Nav intent | `src/hooks/useNavPrefetch.ts` | Sidebar hover → debounced prefetch |
| Guard | `src/lib/navigation/unsavedChangesGuard.ts` | Block navigasi jika ada unsaved changes |

### Kenapa lazy screen via registry?

```typescript
// src/screens/registry.tsx
// Setiap screen di-import dynamic — initial bundle kecil, chunk per domain
export const LazyPOUpdatePage = lazyScreen(screenLoaders[Page.POUpdate]!);
```

Screen berat (Budget HU, CPL, FS Update) tidak ikut initial JS bundle. User hanya download chunk saat navigasi ke screen tersebut — atau saat hover prefetch trigger chunk download lebih awal.

### AppRouteRenderer access gate

```typescript
// Dua gate sebelum render screen:
// 1. shellPermissionsReady → skeleton (tunggu bootstrap + roles)
// 2. permissions.canAccessPage(routePage) → access denied UI
```

FE gate ini **bukan security boundary** — hanya UX. User yang bypass UI tetap blocked di middleware (no session) atau BE (no permission).

---

## BFF pattern

### Browser client

```typescript
// src/lib/capexBeClient.ts
// Browser SELALU: POST /api/be/bootstrap, /api/be/my-tasks/page, dll.
// Server-side (SSR/API route): boleh direct ke CAPEXBE_URL
```

### Edge middleware (Layer 1)

```typescript
// middleware.ts — bukan AuthZ, hanya:
// ✓ Session JWT valid (edgeSession.ts)
// ✓ CSRF match untuk /api/be POST
// ✓ Path ada di bePathAllowlist.ts
// ✓ Rate limit auth routes + BE proxy
// ✓ IP allowlist (optional, IP_ALLOWLIST env)
// ✓ CSP nonce (production)
```

### Server proxy (Layer 2)

```typescript
// src/lib/auth/beProxy.ts
// Re-validate allowlist, forward httpOnly cookies,
// auto-refresh expired access token, strip dangerous headers
```

### BE allowlist sync

FE (`bePathAllowlist.ts`) dan BE (`be-route-allowlist.util.ts`) harus sync. Divergence = 404 di prod. Divergence dicek otomatis:

```bash
cd capexbe && npm run verify:be-routes
```

---

## Backend module structure

```
capexbe/src/
├── auth/           Session, JWT, lockout, guards
├── bootstrap/      Init pack (self-only user, lazy directory)
├── my-tasks/       Paginated task loaders + query engine
├── fs-update/      Meta + paginated projects loader
├── gr-update/      Page bundle loader
├── budget-hu/      Page bundle + projects page loader
├── budget-multi-year/
├── po-update/
├── configuration/  Master data CRUD + cache invalidation
├── backup/         Full export/import (permission-gated)
└── shared/         perf-cache, PII sanitize, cache keys
```

Setiap domain screen punya **controller → service → loader** pattern. Service handle AuthZ; loader handle DB query + cache.

---

## Monorepo layout

```
capex/                    ← git root, turbopack root
├── package.json          ← tailwindcss devDep (shared resolve)
├── capex-apps/           ← Next.js 16 App Router
├── capexbe/              ← NestJS + SWC
├── deploy/               ← nginx template, docker compose
├── scripts/              ← dev.mjs, setup-env.sh
└── Makefile              ← dev shortcuts
```

### Turbopack fix (inherited bug)

Inherited setup: Turbopack resolve `tailwindcss` dari `capex/` root tapi package ada di `capex-apps/node_modules/` → CSS tidak load → UI broken (logo SVG full-screen).

```typescript
// capex-apps/next.config.ts
const monorepoRoot = path.join(appRoot, '..');
turbopack: { root: monorepoRoot },
outputFileTracingRoot: monorepoRoot,
```

Root `package.json` menambahkan `tailwindcss` + `@tailwindcss/postcss` agar resolution konsisten.

---

## Standar untuk feature baru

1. **Screen baru** → tambah ke `screens/registry.tsx`, route di `AppRouteRenderer`, warm policy di `routeWarmPolicy.ts`.
2. **API baru** → controller di capexbe + `@RequirePermission` + entry di `bePathAllowlist.ts` + `verify:be-routes`.
3. **Data berat** → BE loader dengan cache-aside, FE `useQuery` dengan disk hydrate + staleTime 120s.
4. **Mutation** → invalidate cache keys spesifik (lihat `cache-invalidation.util.ts`), jangan flush all.

---

[Lihat README](./README.md) · [Security](./SECURITY.md) · [Data Loading](./DATA-LOADING.md)
