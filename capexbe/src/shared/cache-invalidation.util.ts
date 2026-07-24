import { perfCacheDelete, perfCacheDeleteByPattern } from './perf-cache';

const normPeriod = (periodName: string) => periodName.trim().toLowerCase();

/**
 * Invalidate shared Redis/memory caches for one budget period.
 * When userId is set, only that user's HU page keys are cleared (lighter).
 * When omitted, all users' keys for the period are cleared (after HU save / global mutation).
 */
export async function invalidateBudgetHuPeriodSharedCaches(
  periodName: string,
  scope?: { userId?: number },
): Promise<void> {
  const pn = normPeriod(periodName);
  if (!pn) return;

  const uid = scope?.userId;
  const pagePat = uid
    ? `app:table:budget-hu:page:${uid}:${pn}*`
    : `app:table:budget-hu:page:*:${pn}*`;
  const projectsPagePat = uid
    ? `app:table:budget-hu:projects-page:${uid}:${pn}*`
    : `app:table:budget-hu:projects-page:*:${pn}*`;
  const periodPat = uid
    ? `app:table:budget-hu:period:${uid}:${pn}`
    : `app:table:budget-hu:period:*:${pn}`;
  const networkPat = uid
    ? `app:table:budget-hu:period-network:${uid}:${pn}*`
    : `app:table:budget-hu:period-network:*:${pn}*`;
  const networkShellPat = uid
    ? `app:table:budget-hu:period-network-shell:${uid}:${pn}`
    : `app:table:budget-hu:period-network-shell:*:${pn}`;
  const structurePat = uid
    ? `app:table:budget-hu:period-structure:${uid}:${pn}`
    : `app:table:budget-hu:period-structure:*:${pn}`;
  const countsPat = uid
    ? `app:table:budget-hu:asset-counts:${uid}:${pn}*`
    : `app:table:budget-hu:asset-counts:*:${pn}*`;
  const projectAssetsPat = uid
    ? `app:table:budget-hu:project-assets:${uid}:*`
    : `app:table:budget-hu:project-assets:*`;
  const dashboardPat = uid ? `app:dashboard:${uid}:${pn}*` : `app:dashboard:*:${pn}*`;

  const patterns = [
    pagePat,
    projectsPagePat,
    periodPat,
    networkPat,
    networkShellPat,
    structurePat,
    countsPat,
    projectAssetsPat,
    dashboardPat,
  ];

  for (const pattern of patterns) {
    await perfCacheDeleteByPattern(pattern);
  }

  if (uid) {
    await perfCacheDelete(`app:table:budget-hu:period:${uid}:${pn}`);
    await perfCacheDelete(`app:table:budget-hu:period-network:${uid}:${pn}`);
    await perfCacheDelete(`app:table:budget-hu:period-structure:${uid}:${pn}`);
  }
}

/** Drop in-process dedupe/response entries for budget-hu keys touching a period. */
export function pruneProcessCachesForBudgetPeriod(
  responseCache: Map<string, unknown>,
  inflight: Map<string, Promise<unknown>>,
  periodName: string,
): void {
  const pn = normPeriod(periodName);
  if (!pn) return;
  for (const key of [...responseCache.keys()]) {
    if (key.includes('budget-hu') && key.includes(`:${pn}`)) {
      responseCache.delete(key);
      inflight.delete(key);
    }
  }
}
