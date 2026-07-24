import type { AssetTypeConfig, BudgetCategoryConfig, BudgetPeriod, ProjectPriorityConfig, WorkflowSet } from '../types';
import { getAccessTokenForBackend } from '../lib/authSession';
import { useBackendSession } from '../lib/auth/authConstants';
import { authenticatedFetch } from '../lib/auth/authenticatedFetch';
import { capexBeRequestUrl } from '../lib/capexBeClient';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';
import { withRequestCache, invalidateRequestCache } from '../lib/requestCache';
import { resolveMyTasksAccessToken } from './myTasksApi';

async function budgetHuRequestHeaders(): Promise<Record<string, string> | null> {
  const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  if (!useBackendSession() && !token) return null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export type BudgetHuConfigBundle = {
  routineAssetMaxBudget: number;
  categories: BudgetCategoryConfig[];
  priorities: ProjectPriorityConfig[];
  workflows: WorkflowSet[];
  assetTypes: AssetTypeConfig[];
};

export type BudgetHuPageBundle = {
  budgetPeriod: BudgetPeriod | null;
  routineAssetMaxBudget: number;
  categories: BudgetCategoryConfig[];
  priorities: ProjectPriorityConfig[];
  workflows: WorkflowSet[];
  assetTypes: AssetTypeConfig[];
  studies: Array<{ id: string; projectId: string; conclusion: string }>;
};

/**
 * Hanya pohon `BudgetPeriod` — ringan untuk App shell (`currentBudgetPeriod`), tanpa master form.
 */
export async function fetchBudgetPeriodOnlyFromBackend(
  periodName: string,
  userId: number,
): Promise<BudgetPeriod | null> {
  const cacheKey = `app:table:budget-hu:period:${userId}:${periodName.trim().toLowerCase()}`;
  return withRequestCache(
    cacheKey,
    async () => {
      const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
      if (!base || !periodName.trim()) {
        trackBackendFetch('budgetHu.periodOnly', 'fallback', { reason: 'invalid_request' });
        return null;
      }

      const headers = await budgetHuRequestHeaders();
      if (!headers) {
        trackBackendFetch('budgetHu.periodOnly', 'fallback', { reason: 'missing_access_token' });
        return null;
      }
      try {
        const res = await authenticatedFetch(capexBeRequestUrl('/budget-hu/period'), {
          method: 'POST',
          headers,
          credentials: useBackendSession() ? 'include' : 'same-origin',
          body: JSON.stringify({ periodName: periodName.trim(), userId }),
        });

        if (!res.ok) {
          trackBackendFetch('budgetHu.periodOnly', 'fallback', { reason: 'http_error', httpStatus: res.status });
          return null;
        }
        const body = (await res.json()) as { budgetPeriod: BudgetPeriod | null };
        trackBackendFetch('budgetHu.periodOnly', 'success');
        return body.budgetPeriod ?? null;
      } catch {
        trackBackendFetch('budgetHu.periodOnly', 'fallback', { reason: 'network_error' });
        return null;
      }
    },
    5 * 60 * 1000,
  );
}

/** Master data for HU forms — Redis-backed on Nest when REDIS_URL is set. */
export async function fetchBudgetHuConfigFromBackend(userId: number): Promise<BudgetHuConfigBundle | null> {
  const cacheKey = 'app:master:budget-hu:config';
  return withRequestCache(
    cacheKey,
    async () => {
      const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
      if (!base || !Number.isFinite(userId)) {
        trackBackendFetch('budgetHu.config', 'fallback', { reason: 'invalid_request' });
        return null;
      }

      const headers = await budgetHuRequestHeaders();
      if (!headers) {
        trackBackendFetch('budgetHu.config', 'fallback', { reason: 'missing_access_token' });
        return null;
      }

      try {
        const res = await authenticatedFetch(capexBeRequestUrl('/budget-hu/config-bundle'), {
          method: 'POST',
          headers,
          credentials: useBackendSession() ? 'include' : 'same-origin',
          body: JSON.stringify({ periodName: '_', userId }),
        });
        if (!res.ok) {
          trackBackendFetch('budgetHu.config', 'fallback', { reason: 'http_error', httpStatus: res.status });
          return null;
        }
        const data = (await res.json()) as Partial<BudgetHuConfigBundle>;
        trackBackendFetch('budgetHu.config', 'success');
        return {
          routineAssetMaxBudget: Number(data.routineAssetMaxBudget ?? 0) || 0,
          categories: Array.isArray(data.categories) ? data.categories : [],
          priorities: Array.isArray(data.priorities) ? data.priorities : [],
          workflows: Array.isArray(data.workflows) ? data.workflows : [],
          assetTypes: Array.isArray(data.assetTypes) ? data.assetTypes : [],
        };
      } catch {
        trackBackendFetch('budgetHu.config', 'fallback', { reason: 'network_error' });
        return null;
      }
    },
    30 * 60 * 1000,
  );
}

export async function invalidateBudgetHuBackendCache(
  periodName: string,
  userId: number,
): Promise<void> {
  const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
  if (!base || !periodName.trim()) return;

  const headers = await budgetHuRequestHeaders();
  if (!headers) return;

  try {
    await authenticatedFetch(capexBeRequestUrl('/budget-hu/invalidate-cache'), {
      method: 'POST',
      headers,
      credentials: useBackendSession() ? 'include' : 'same-origin',
      body: JSON.stringify({ periodName: periodName.trim(), userId }),
    });
  } catch {
    /* fallback: client caches expire via TTL */
  }
}

/**
 * Satu request ke Nest: BudgetPeriod lengkap + konfigurasi form (paralel di server).
 * Menghindari banyak round-trip Supabase dari browser.
 */
export async function fetchBudgetHuPageBundle(
  periodName: string,
  userId: number,
  options?: { skipCache?: boolean; hospitalUnitId?: string; omitConfig?: boolean; omitAssets?: boolean; shellOnly?: boolean },
): Promise<BudgetHuPageBundle | null> {
  const huId = String(options?.hospitalUnitId ?? '').trim();
  const shellOnly = options?.shellOnly === true;
  const omitAssets = options?.omitAssets === true;
  const suffix = shellOnly ? ':shell' : omitAssets ? ':lite' : '';
  const cacheKey = huId
    ? `app:table:budget-hu:page:${userId}:${periodName.trim().toLowerCase()}:hu:${huId}${suffix}`
    : `app:table:budget-hu:page:${userId}:${periodName.trim().toLowerCase()}${suffix}`;
  const skipCache = options?.skipCache === true;
  if (skipCache) {
    invalidateRequestCache(cacheKey);
  }

  const run = async (): Promise<BudgetHuPageBundle | null> => {
    const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
    if (!base || !periodName.trim()) {
      trackBackendFetch('budgetHu.bundle', 'fallback', { reason: 'invalid_request' });
      return null;
    }

    const headers = await budgetHuRequestHeaders();
    if (!headers) {
      trackBackendFetch('budgetHu.bundle', 'fallback', { reason: 'missing_access_token' });
      return null;
    }
    try {
      const res = await authenticatedFetch(capexBeRequestUrl('/budget-hu/page-bundle'), {
        method: 'POST',
        headers,
        credentials: useBackendSession() ? 'include' : 'same-origin',
        body: JSON.stringify({
          periodName: periodName.trim(),
          userId,
          skipCache,
          hospitalUnitId: huId || undefined,
          omitConfig: options?.omitConfig === true,
          omitAssets: options?.omitAssets === true,
          shellOnly: options?.shellOnly === true,
        }),
      });

      if (!res.ok) {
        trackBackendFetch('budgetHu.bundle', 'fallback', { reason: 'http_error', httpStatus: res.status });
        return null;
      }
      trackBackendFetch('budgetHu.bundle', 'success');
      const data = (await res.json()) as Partial<BudgetHuPageBundle>;
      return {
        budgetPeriod: data.budgetPeriod ?? null,
        routineAssetMaxBudget: Number(data.routineAssetMaxBudget ?? 0) || 0,
        categories: Array.isArray(data.categories) ? data.categories : [],
        priorities: Array.isArray(data.priorities) ? data.priorities : [],
        workflows: Array.isArray(data.workflows) ? data.workflows : [],
        assetTypes: Array.isArray(data.assetTypes) ? data.assetTypes : [],
        studies: Array.isArray(data.studies) ? data.studies : [],
      };
    } catch {
      trackBackendFetch('budgetHu.bundle', 'fallback', { reason: 'network_error' });
      return null;
    }
  };

  if (skipCache) return run();
  return withRequestCache(cacheKey, run, 5 * 60 * 1000);
}

export type BudgetHuProjectsPageResult = {
  projects: import('../types').Project[];
  total: number;
  page: number;
  pageSize: number;
  studies: Array<{ id: string; projectId: string; conclusion: string }>;
};

/** Server-paginated strategic projects for one HU (Budget HU table). */
export async function fetchBudgetHuProjectsPage(
  periodName: string,
  userId: number,
  hospitalUnitId: string,
  page: number,
  pageSize: number,
  search = '',
): Promise<BudgetHuProjectsPageResult> {
  const huId = String(hospitalUnitId ?? '').trim();
  const searchKey = search.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 80) || '_';
  const cacheKey = `app:table:budget-hu:projects-page:${userId}:${periodName.trim().toLowerCase()}:hu:${huId}:${page}:${pageSize}:${searchKey}`;

  return withRequestCache(
    cacheKey,
    async () => {
      const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
      if (!base || !periodName.trim() || !huId) {
        return { projects: [], total: 0, page: 1, pageSize, studies: [] };
      }

      const headers = await budgetHuRequestHeaders();
      if (!headers) {
        return { projects: [], total: 0, page: 1, pageSize, studies: [] };
      }

      try {
        const res = await authenticatedFetch(capexBeRequestUrl('/budget-hu/hu-projects-page'), {
          method: 'POST',
          headers,
          credentials: useBackendSession() ? 'include' : 'same-origin',
          body: JSON.stringify({
            periodName: periodName.trim(),
            userId,
            hospitalUnitId: huId,
            page,
            pageSize,
            search: search.trim(),
          }),
        });
        if (!res.ok) {
          return { projects: [], total: 0, page, pageSize, studies: [] };
        }
        const body = (await res.json()) as Partial<BudgetHuProjectsPageResult>;
        return {
          projects: Array.isArray(body.projects) ? (body.projects as import('../types').Project[]) : [],
          total: Number(body.total ?? 0) || 0,
          page: Number(body.page ?? page) || page,
          pageSize: Number(body.pageSize ?? pageSize) || pageSize,
          studies: Array.isArray(body.studies) ? body.studies : [],
        };
      } catch {
        return { projects: [], total: 0, page, pageSize, studies: [] };
      }
    },
    5 * 60 * 1000,
  );
}

/** Per-project asset counts — scoped to one HU when hospitalUnitId is set. */
export async function fetchBudgetHuProjectAssetCounts(
  periodName: string,
  userId: number,
  options?: { hospitalUnitId?: string },
): Promise<Record<string, number>> {
  const huId = String(options?.hospitalUnitId ?? '').trim();
  const cacheKey = huId
    ? `app:table:budget-hu:asset-counts:${userId}:${periodName.trim().toLowerCase()}:hu:${huId}`
    : `app:table:budget-hu:asset-counts:${userId}:${periodName.trim().toLowerCase()}`;
  return withRequestCache(
    cacheKey,
    async () => {
      const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
      if (!base || !periodName.trim()) {
        trackBackendFetch('budgetHu.assetCounts', 'fallback', { reason: 'invalid_request' });
        return {};
      }

      const headers = await budgetHuRequestHeaders();
      if (!headers) {
        trackBackendFetch('budgetHu.assetCounts', 'fallback', { reason: 'missing_access_token' });
        return {};
      }
      try {
        const res = await authenticatedFetch(capexBeRequestUrl('/budget-hu/project-asset-counts'), {
          method: 'POST',
          headers,
          credentials: useBackendSession() ? 'include' : 'same-origin',
          body: JSON.stringify({
            periodName: periodName.trim(),
            userId,
            hospitalUnitId: huId || undefined,
          }),
        });
        if (!res.ok) {
          trackBackendFetch('budgetHu.assetCounts', 'fallback', {
            reason: 'http_error',
            httpStatus: res.status,
          });
          return {};
        }
        trackBackendFetch('budgetHu.assetCounts', 'success');
        const body = (await res.json()) as Record<string, number>;
        return body && typeof body === 'object' ? body : {};
      } catch {
        trackBackendFetch('budgetHu.assetCounts', 'fallback', { reason: 'network_error' });
        return {};
      }
    },
    5 * 60 * 1000,
  );
}

/** Lazy-load assets for one project (Budget HU asset editor). */
export async function fetchBudgetHuProjectAssets(
  periodName: string,
  userId: number,
  projectId: string,
): Promise<import('../types').Asset[]> {
  const pid = String(projectId ?? '').trim();
  const cacheKey = `app:table:budget-hu:project-assets:${userId}:${pid}`;
  return withRequestCache(
    cacheKey,
    async () => {
      const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
      if (!base || !periodName.trim() || !pid) return [];

      const headers = await budgetHuRequestHeaders();
      if (!headers) return [];

      try {
        const res = await authenticatedFetch(capexBeRequestUrl('/budget-hu/project-assets'), {
          method: 'POST',
          headers,
          credentials: useBackendSession() ? 'include' : 'same-origin',
          body: JSON.stringify({ periodName: periodName.trim(), userId, projectId: pid }),
        });
        if (!res.ok) return [];
        const body = (await res.json()) as { assets?: import('../types').Asset[] };
        return Array.isArray(body.assets) ? body.assets : [];
      } catch {
        return [];
      }
    },
    5 * 60 * 1000,
  );
}

export type BudgetHuSyncStamp = {
  fingerprint: string;
  projectSignature: string;
  projectCount: number;
  assetCount: number;
};

/**
 * Uncached change stamp for one HU — polled while Budget HU is open so peers
 * see creates/updates without relying on Supabase Realtime auth.
 */
export async function fetchBudgetHuSyncStamp(
  periodName: string,
  userId: number,
  hospitalUnitId: string,
): Promise<BudgetHuSyncStamp | null> {
  const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
  const pn = periodName.trim();
  const huId = hospitalUnitId.trim();
  if (!base || !pn || !huId || !Number.isFinite(userId)) return null;

  const headers = await budgetHuRequestHeaders();
  if (!headers) return null;

  try {
    const res = await authenticatedFetch(capexBeRequestUrl('/budget-hu/hu-sync-stamp'), {
      method: 'POST',
      headers,
      credentials: useBackendSession() ? 'include' : 'same-origin',
      body: JSON.stringify({ periodName: pn, userId, hospitalUnitId: huId }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<BudgetHuSyncStamp>;
    const fingerprint = String(body.fingerprint ?? '').trim();
    if (!fingerprint) return null;
    return {
      fingerprint,
      projectSignature: String(body.projectSignature ?? '').trim(),
      projectCount: Number(body.projectCount ?? 0) || 0,
      assetCount: Number(body.assetCount ?? 0) || 0,
    };
  } catch {
    return null;
  }
}
