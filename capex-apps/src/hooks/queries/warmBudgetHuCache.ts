import type { QueryClient } from '@tanstack/react-query';
import type { BudgetPeriod } from '@/types';
import { queryKeys } from '@/lib/query-keys';
import { fetchBudgetHuConfigBundle } from '@/screens/BudgetHU/fetchBudgetHuConfig';
import {
  budgetPeriodHuProjectCounts,
  compareBudgetPeriodRichness,
  mergeRicherBudgetPeriods,
  readBudgetHuConfigCacheAnyAge,
  readBudgetHuPageCacheAnyAge,
} from '@/lib/budgetHuDiskCache';
import {
  fetchBudgetHuPageRemote,
  isAppBudgetPeriodStructureShell,
  type BudgetHuRemoteBundle,
} from '@/hooks/queries/fetchBudgetHuPageData';
import { fetchBudgetHuProjectAssetCounts } from '@/services/budgetHuPageApi';
import type { BudgetHuPageBundle } from '@/services/budgetHuPageApi';
import { scheduleStaggeredIdle } from '@/lib/scheduleIdlePrefetch';

const CONFIG_STALE_MS = 30 * 60 * 1000;
const PAGE_STALE_MS = 5 * 60 * 1000;
const PREFETCH_TIMEOUT_MS = 8_000;
/** Cap background HU warms — avoids prefetch storm across all visible units. */
const MAX_NEIGHBOR_HU_PREFETCH = 2;

function isHuPageQueryFresh(
  queryClient: QueryClient,
  period: string,
  userId: number,
  huId: string,
): boolean {
  const qk = queryKeys.budgetHu.page(period, userId, huId);
  const state = queryClient.getQueryState(qk);
  const data = queryClient.getQueryData<BudgetHuRemoteBundle>(qk);
  return (
    !!state?.dataUpdatedAt &&
    Date.now() - state.dataUpdatedAt < PAGE_STALE_MS &&
    !!data?.budgetPeriod
  );
}

/** Pick up to N HUs adjacent to the active one in the sidebar list. */
function pickNeighborHuIds(
  huIds: readonly string[],
  activeHuId: string,
  max: number,
): string[] {
  const active = String(activeHuId ?? '').trim();
  const ids = huIds.map((id) => String(id).trim()).filter(Boolean);
  if (max <= 0 || ids.length === 0) return [];
  const idx = active ? ids.indexOf(active) : -1;
  if (idx < 0) {
    return ids.filter((id) => id !== active).slice(0, max);
  }
  const out: string[] = [];
  for (let d = 1; out.length < max && (idx - d >= 0 || idx + d < ids.length); d++) {
    if (idx - d >= 0) {
      const id = ids[idx - d];
      if (id !== active) out.push(id);
    }
    if (out.length >= max) break;
    if (idx + d < ids.length) {
      const id = ids[idx + d];
      if (id !== active) out.push(id);
    }
  }
  return out.slice(0, max);
}

/** Hydrate TanStack Query from disk + prefetch (instant paint after F5). */
export function warmBudgetHuConfigCache(queryClient: QueryClient, userId: number): void {
  if (!Number.isFinite(userId)) return;

  const diskConfig = readBudgetHuConfigCacheAnyAge(userId);
  if (diskConfig) {
    queryClient.setQueryData(queryKeys.budgetHu.config(), diskConfig);
  }

  void queryClient.prefetchQuery({
    queryKey: queryKeys.budgetHu.config(),
    queryFn: () => fetchBudgetHuConfigBundle(userId),
    staleTime: CONFIG_STALE_MS,
  });
}

/** Seed HU-scoped React Query keys from period-wide disk cache (fixes key mismatch). */
export function hydrateBudgetHuPageFromDisk(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  options?: { hospitalUnitId?: string },
): boolean {
  if (!periodName.trim() || !Number.isFinite(userId)) return false;
  const disk = readBudgetHuPageCacheAnyAge(periodName, userId);
  if (!disk?.budgetPeriod) return false;

  const targetHu = String(options?.hospitalUnitId ?? '').trim();
  const counts = budgetPeriodHuProjectCounts(disk.budgetPeriod);
  const huIds = targetHu
    ? counts.get(targetHu)
      ? [targetHu]
      : []
    : [...counts.entries()].filter(([, n]) => n > 0).map(([id]) => id);

  if (huIds.length === 0) return false;

  for (const huId of huIds) {
    queryClient.setQueryData(queryKeys.budgetHu.page(periodName, userId, huId), {
      ...disk,
      scopedHuId: huId,
      source: 'bundle' as const,
    } satisfies BudgetHuRemoteBundle);
  }
  return true;
}

/** Warm config + disk hydrate only — full period bundle is HU-scoped on Budget HU page. */
export async function prefetchBudgetHuPage(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  options?: { awaitMs?: number; hospitalUnitId?: string },
): Promise<void> {
  const period = periodName.trim();
  if (!period || !Number.isFinite(userId)) return;
  warmBudgetHuConfigCache(queryClient, userId);
  hydrateBudgetHuPageFromDisk(queryClient, period, userId, {
    hospitalUnitId: options?.hospitalUnitId,
  });

  const huId = String(options?.hospitalUnitId ?? '').trim();
  // Without a HU scope, do not pull the entire period tree (was the main load bottleneck).
  if (!huId) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.budgetHu.assetCounts(period, userId),
      queryFn: () => fetchBudgetHuProjectAssetCounts(period, userId),
      staleTime: PAGE_STALE_MS,
    });
    return;
  }

  const qk = queryKeys.budgetHu.page(period, userId, huId);
  if (isHuPageQueryFresh(queryClient, period, userId, huId)) return;

  const prefetch = queryClient.prefetchQuery({
    queryKey: qk,
    queryFn: () =>
      fetchBudgetHuPageRemote(period, userId, {
        hospitalUnitId: huId,
        omitConfig: true,
        omitAssets: true,
        shellOnly: true,
      }),
    staleTime: PAGE_STALE_MS,
  });

  void queryClient.prefetchQuery({
    queryKey: queryKeys.budgetHu.assetCounts(period, userId, huId),
    queryFn: () => fetchBudgetHuProjectAssetCounts(period, userId, { hospitalUnitId: huId }),
    staleTime: PAGE_STALE_MS,
  });

  const cap = options?.awaitMs;
  if (cap != null && cap > 0) {
    await Promise.race([prefetch, new Promise<void>((r) => setTimeout(r, cap))]);
    return;
  }
  await prefetch;
}

/** Prefetch adjacent HUs only (cap background load — not the full visible list). */
export function prefetchBudgetHuUnitsIdle(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  huIds: readonly string[],
  activeHuId?: string | null,
): void {
  const period = periodName.trim();
  if (!period || !Number.isFinite(userId) || huIds.length === 0) return;
  const active = String(activeHuId ?? '').trim();
  const targets = pickNeighborHuIds(huIds, active, MAX_NEIGHBOR_HU_PREFETCH).filter(
    (huId) => !isHuPageQueryFresh(queryClient, period, userId, huId),
  );

  scheduleStaggeredIdle(
    targets.map(
      (huId) => () => {
        void prefetchBudgetHuPage(queryClient, period, userId, { hospitalUnitId: huId });
      },
    ),
    1500,
  );
}

export function prefetchBudgetHuPageWithTimeout(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  timeoutMs = PREFETCH_TIMEOUT_MS,
  options?: { hospitalUnitId?: string },
): Promise<void> {
  return prefetchBudgetHuPage(queryClient, periodName, userId, {
    awaitMs: timeoutMs,
    hospitalUnitId: options?.hospitalUnitId,
  });
}

/** Sync App shell period fetch into TanStack Query so Budget HU paints without a second round-trip. */
export function hydrateBudgetHuPeriodInQueryCache(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  period: BudgetPeriod,
): void {
  const periodKey = periodName.trim();
  if (!periodKey || !Number.isFinite(userId)) return;
  if (isAppBudgetPeriodStructureShell(period, periodKey)) return;

  const merged = mergeRicherBudgetPeriods(periodKey, undefined, period) ?? period;
  const bundle: BudgetHuPageBundle = {
    budgetPeriod: merged,
    routineAssetMaxBudget: 0,
    categories: [],
    priorities: [],
    workflows: [],
    assetTypes: [],
    studies: [],
  };

  for (const [huId, count] of budgetPeriodHuProjectCounts(merged)) {
    if (count <= 0) continue;
    queryClient.setQueryData(queryKeys.budgetHu.page(periodKey, userId, huId), (old: BudgetHuRemoteBundle | undefined) => {
      const nextPeriod = mergeRicherBudgetPeriods(periodKey, old?.budgetPeriod, merged) ?? merged;
      if (
        old?.budgetPeriod &&
        !isAppBudgetPeriodStructureShell(old.budgetPeriod, periodKey) &&
        compareBudgetPeriodRichness(nextPeriod, old.budgetPeriod) <= 0
      ) {
        return old;
      }
      return {
        ...bundle,
        budgetPeriod: nextPeriod,
        routineAssetMaxBudget: old?.routineAssetMaxBudget ?? 0,
        categories: old?.categories ?? [],
        priorities: old?.priorities ?? [],
        workflows: old?.workflows ?? [],
        assetTypes: old?.assetTypes ?? [],
        studies: old?.studies ?? [],
        scopedHuId: huId,
        source: 'bundle' as const,
      };
    });
  }
}
