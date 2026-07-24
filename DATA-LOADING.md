# Data Loading

Strategi data loading yang dibangun selama remediasi — menggantikan full-fetch inherited pattern.

---

## Problem inherited

- Setiap navigasi = full API call, no cache strategy
- My Tasks / FS Update load **seluruh dataset** sekaligus → slow TTFB, heavy memory
- Tidak ada offline-first / instant paint — user selalu lihat loading spinner
- Redis failure → BE hang 10–22 detik per request

---

## Progressive loading model

```
Phase 1  Disk snapshot     localStorage, sync read, <50ms paint
Phase 2  React Query cache  staleTime 120s, gcTime 30min
Phase 3  Network fetch      background, deduped via prefetchGate
Phase 4  BE cache-aside      process memory + Redis, TTL 5min
```

User experience: **instant paint dari disk** → data refresh silently di background.

---

## Frontend pipeline

### 1. Page preloads (sync, before paint)

```typescript
// src/hooks/usePagePreloads.ts
// Hanya baca localStorage untuk route AKTIF — tidak scan semua cache
const preloads = useMemo(() => ({
  myTasks: routePage === Page.MyTask ? readMyTasksDiskCache(uid) : null,
  poUpdate: routePage === Page.POUpdate ? readPoUpdateSnapshot(uid, period) : null,
  // ...
}), [routePage, uid, periodName]);
```

Passed ke screen sebagai `preloadedSnapshot` / `preloadedTasks` prop.

### 2. Route warm (async, after mount)

```typescript
// src/hooks/useRouteWarm.ts
useLayoutEffect(() => hydrateRouteDisk(...), [...]);  // before paint
useEffect(() => prefetchRouteNetwork(...), [...]);      // after paint
```

Policy per screen: `src/lib/navigation/routeWarmPolicy.ts`

### 3. React Query defaults

```typescript
// src/providers/AppProviders.tsx
staleTime: 120_000,       // 2 min — don't refetch if fresh
gcTime: 24 * 60 * 60_000, // 24h — keep in memory
refetchOnMount: false,    // trust cache on remount
networkMode: 'offlineFirst',
```

Persisted to localStorage (`capex.tanstack-query.v1`) — heavy infinite queries **excluded** via `queryDehydrate.ts`.

### 4. Prefetch gate (concurrency control)

```typescript
// src/lib/prefetchGate.ts
// Max 2 concurrent background prefetches per tab
// Sidebar hover: 350ms debounce before prefetch
// Active route: idle-scheduled at 2.5s
```

Mencegah thundering herd saat user hover cepat di sidebar.

---

## Per-screen loading strategy

| Screen | FE pattern | BE endpoint | Pagination |
|--------|-----------|-------------|------------|
| **My Tasks** | Disk v2 + infinite query pilot | `my-tasks/page` | Server filter/sort/page |
| **FS Update** | Meta query + table query split | `fs-update/meta`, `fs-update/query` | 20 rows/page |
| **GR Update** | Full bundle + Zod validate | `gr-update/page-bundle` | All assets (filtered client) |
| **PO Update** | Disk snapshot + dirty derive | `po-update/page-bundle` | All assets (filtered client) |
| **Budget HU** | Page bundle + lazy projects | `budget-hu/page-bundle`, `projects-page` | Projects paginated per HU |
| **Multi-Year** | Bootstrap seed + lazy periods | `budget-multi-year/page-bundle`, `period-budgets` | Periods on row expand |
| **CPL** | Disk table + windowed render | `project-list/assets-query` | Virtual window |
| **BDD** | Disk pipeline | `project-list/bdd-construction` | Virtual window |

### My Tasks — server pagination

```typescript
// BE: my-tasks-query.ts — filter/sort/page on cached snapshot
// FE: useMyTasksScreenQuery (paged) + useMyTasksInfiniteList (infinite pilot, max 5 pages)
// Disk: myTasksDiskCache.ts — v2 envelope, 5min TTL, filter persistence
```

### FS Update — split query

Inherited: satu endpoint return semua projects. Remediasi:

```typescript
// useFsUpdateMetaQuery    → counts, filters, archetype scope
// useFsUpdateTableQuery   → paginated rows, debounced search
// Separate cache keys → meta stable while table paginates
```

### Multi-Year — lazy expand

List multi-year cached (React Query 2min + BE Redis 5min). Period detail budgets **tidak** di-load upfront:

```typescript
// ensurePeriodBudgetsLoaded(multiYearName)
// Triggered on row expand → fetchMultiYearPeriodBudgets
// Cached per multiYearName in React Query
```

> Expand state hilang saat pindah tab (page unmount). By design — bukan bug.

---

## Backend cache-aside

```typescript
// Pattern di semua loader baru:
async loadPage(accessToken, userId) {
  const key = cacheKeys.myTasksPage(userId);
  const hit = await cacheAside.get(key);       // process → Redis
  if (hit) return sanitizeEgress(hit);
  const data = await loaderFromDb(...);
  await cacheAside.set(key, data, TTL_5MIN);
  return sanitizeEgress(data);
}
```

**File:** `capexbe/src/shared/cache-aside.service.ts`, `perf-cache.ts`

### Redis circuit breaker (fix inherited crash)

```typescript
// perf-cache.ts — inherited: Redis down → reconnect loop → ClientClosedError → BE crash
// Remediasi:
redisDisabledUntil = now + 60_000;  // skip Redis 60s after failure
safeCloseRedis(client);             // check isOpen before destroy
error log cooldown 30s;             // no log spam
memory fallback;                    // single-instance still works
```

---

## Cache TTL reference

| Layer | TTL | Invalidation |
|-------|-----|-------------|
| React Query stale | 2 min | `invalidateQueries` on mutation |
| React Query gc | 30 min | Automatic |
| withRequestCache (FE) | 2 min | Prefix invalidate |
| perf-cache TABLE (BE) | 5 min | Pattern delete on save |
| Disk snapshot (FE) | ~5 min | Version bump on schema change |
| My Tasks master (BE process) | 5 min | Process restart |

---

## Adding data loading to new screen

1. Create `fetchXPageData.ts` in `src/hooks/queries/`
2. Add query key to `src/lib/query-keys.ts`
3. Optional: disk cache module `xDiskCache.ts` with TTL envelope
4. Register in `routeWarmPolicy.ts` (hydrate + prefetch)
5. BE: loader + cache key in `cache-keys.ts` + `@RequirePermission`
6. Add path to `bePathAllowlist.ts` + run `verify:be-routes`

---

[Lihat README](./README.md) · [Architecture](./ARCHITECTURE.md)
