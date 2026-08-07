import type { QueryClient } from '@tanstack/react-query';
import type { BudgetCategoryConfig, BudgetMultiYear, BudgetPeriod } from '@/types';
import { queryKeys } from '@/lib/query-keys';
import type { AppBootstrapPayload } from '@/hooks/queries/fetchAppBootstrapData';
import { readConfigurationPackCacheAnyAge } from '@/lib/configurationDiskCache';
import type { ConfigurationDataPack } from '@/services/configurationApi';
import { useBackendSession } from '@/lib/auth/authConstants';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { fetchConfigurationSlicesFromBackend } from '@/services/configurationApi';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { withRequestCache } from '@/lib/requestCache';
import {
  fetchBudgetMultiYearPageBundleFromBackend,
  fetchMultiYearPeriodBudgetsFromBackend,
} from '@/services/budgetMultiYearPageApi';

export type BudgetMultiYearPageBundle = {
  multiYears: BudgetMultiYear[];
  categories: BudgetCategoryConfig[];
  periodSummaries: BudgetPeriod[];
};

const PAGE_STALE_MS = 120_000;

/** Bootstrap shell: metadata only — usage metrics always zero until page-bundle succeeds. */
export function isMultiYearBootstrapShell(multiYears: BudgetMultiYear[]): boolean {
  if (!multiYears.length) return false;
  return multiYears.every((my) => {
    const b = my.budget ?? {};
    return (
      (b.budgetCarryForward ?? 0) === 0 &&
      (b.budgetAllocated ?? 0) === 0 &&
      (b.approvedBudget ?? 0) === 0 &&
      (b.consumedBudget ?? 0) === 0
    );
  });
}

async function resolveBootstrapUserId(queryClient?: QueryClient): Promise<number | null> {
  if (typeof window === 'undefined') return null;
  const fromSession = sessionStorage.getItem('currentUserId');
  if (fromSession) {
    const uid = parseInt(fromSession, 10);
    if (Number.isFinite(uid)) return uid;
  }
  const bootstrap = queryClient?.getQueryData<AppBootstrapPayload>([...queryKeys.app.bootstrap]);
  const fromBootstrap = bootstrap?.users?.[0]?.id;
  return fromBootstrap != null && Number.isFinite(fromBootstrap) ? fromBootstrap : null;
}

function readCategoriesFromLocalCache(
  queryClient: QueryClient | undefined,
  userId: number | null,
): BudgetCategoryConfig[] {
  if (userId == null) return [];
  const fromQuery = queryClient?.getQueryData<Partial<ConfigurationDataPack>>(
    queryKeys.configuration.page(userId),
  );
  const fromDisk = readConfigurationPackCacheAnyAge(userId);
  const raw = fromQuery?.budgetCategories ?? fromDisk?.budgetCategories ?? [];
  return raw.filter((c) => c.isActive);
}

function pickMultiYears(
  primary: BudgetMultiYear[] | undefined,
  fallback: BudgetMultiYear[] | undefined,
): BudgetMultiYear[] {
  if (primary?.length) return primary;
  if (fallback?.length) return fallback;
  return [];
}

/** Paint instan: bootstrap multi-year + kategori dari cache konfigurasi. */
export function buildBudgetMultiYearPageSeedFromCache(
  queryClient: QueryClient | undefined,
  userId: number | null,
): BudgetMultiYearPageBundle {
  const bootstrap = queryClient?.getQueryData<AppBootstrapPayload>([...queryKeys.app.bootstrap]);
  const multiYears = bootstrap?.multiYears?.length ? bootstrap.multiYears : [];
  const categories = readCategoriesFromLocalCache(queryClient, userId);
  return { multiYears, categories, periodSummaries: [] };
}

async function loadActiveCategories(
  queryClient: QueryClient | undefined,
  userId: number | null,
): Promise<BudgetCategoryConfig[]> {
  const cached = readCategoriesFromLocalCache(queryClient, userId);
  if (cached.length) return cached;

  const preferBackend = isCapexBeConfigured() && (useBackendSession() || userId != null);
  if (preferBackend && userId != null) {
    const token = useBackendSession() ? null : await getAccessTokenForBackend();
    const fromBe = await fetchConfigurationSlicesFromBackend(token, userId, ['budgetCategories']);
    const categories = fromBe?.budgetCategories;
    if (Array.isArray(categories) && categories.length) {
      return categories.filter((c) => c.isActive);
    }
  }

  return [];
}

async function fetchPageBundleFromNetwork(
  queryClient: QueryClient | undefined,
  userId: number | null,
): Promise<BudgetMultiYearPageBundle | null> {
  const bootstrap = queryClient?.getQueryData<AppBootstrapPayload>([...queryKeys.app.bootstrap]);
  const cachedMultiYears = bootstrap?.multiYears?.length ? bootstrap.multiYears : null;
  const cachedPeriodSummaries = bootstrap?.allPeriods?.length ? bootstrap.allPeriods : [];

  if (userId != null && isCapexBeConfigured()) {
    const fromBe = await fetchBudgetMultiYearPageBundleFromBackend(userId);
    if (
      fromBe &&
      fromBe.multiYears.length > 0 &&
      !isMultiYearBootstrapShell(fromBe.multiYears)
    ) {
      const categories = fromBe.categories.length
        ? fromBe.categories.filter((c) => c.isActive)
        : await loadActiveCategories(queryClient, userId);
      return {
        multiYears: fromBe.multiYears,
        categories,
        periodSummaries: fromBe.periodSummaries.length ? fromBe.periodSummaries : cachedPeriodSummaries,
      };
    }
    // BE configured — jangan fallback ke bootstrap shell (metadata + Rp 0)
    return null;
  }

  const [multiYears, categories] = await Promise.all([
    cachedMultiYears ?? Promise.resolve([]),
    loadActiveCategories(queryClient, userId),
  ]);

  return {
    multiYears: pickMultiYears(multiYears, cachedMultiYears ?? undefined),
    categories,
    periodSummaries: cachedPeriodSummaries,
  };
}

/**
 * Muat multi-year + rollup agregat untuk tabel utama.
 * Bootstrap seed hanya placeholder paint; network wajib saat BE tersedia.
 */
export async function fetchBudgetMultiYearPageBundle(
  queryClient?: QueryClient,
  userId?: number | null,
): Promise<BudgetMultiYearPageBundle> {
  const resolvedUserId =
    userId != null && Number.isFinite(userId)
      ? userId
      : await resolveBootstrapUserId(queryClient);
  const seed = buildBudgetMultiYearPageSeedFromCache(queryClient, resolvedUserId);

  if (!isCapexBeConfigured()) {
    return seed;
  }

  const cacheKey =
    resolvedUserId != null
      ? `budget-multi-year:page:${resolvedUserId}`
      : 'budget-multi-year:page:anon';
  const network = await fetchPageBundleFromNetwork(queryClient, resolvedUserId);
  if (network?.multiYears.length && !isMultiYearBootstrapShell(network.multiYears)) {
    return withRequestCache(cacheKey, () => Promise.resolve(network), PAGE_STALE_MS);
  }
  // Keep bootstrap rows visible — never replace painted data with empty/network miss
  if (seed.multiYears.length) return seed;
  if (network) return network;
  return seed;
}

export async function fetchMultiYearPeriodBudgets(
  multiYearName: string,
  userId?: number,
): Promise<{ periods: BudgetPeriod[]; categories: BudgetCategoryConfig[] }> {
  const uid =
    userId ??
    (typeof window !== 'undefined' ? parseInt(sessionStorage.getItem('currentUserId') || '', 10) : NaN);
  const name = multiYearName.trim();
  const cacheKey =
    Number.isFinite(uid) && name
      ? `budget-multi-year:period-budgets:${uid}:${name.toLowerCase()}`
      : null;

  const loader = async (): Promise<{ periods: BudgetPeriod[]; categories: BudgetCategoryConfig[] }> => {
    if (Number.isFinite(uid) && isCapexBeConfigured()) {
      const fromBe = await fetchMultiYearPeriodBudgetsFromBackend(uid, name);
      if (fromBe) return fromBe;
    }

    return { periods: [], categories: [] };
  };

  if (!cacheKey) return loader();
  return withRequestCache(cacheKey, loader, PAGE_STALE_MS);
}
