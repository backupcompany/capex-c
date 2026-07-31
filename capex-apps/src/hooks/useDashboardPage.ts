import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { User } from '@/types';
import { queryKeys } from '@/lib/query-keys';
import {
  DASHBOARD_GC_TIME_MS,
  DASHBOARD_STALE_TIME_MS,
  EMPTY_DASHBOARD_STATS,
} from '@/lib/dashboard/constants';
import { readCachedDashboardBundle, writeCachedDashboardBundle } from '@/lib/dashboard/snapshotCache';
import { writeCachedDashboardStats } from '@/lib/dashboard/statsCache';
import { resolveDashboardStatsFromBundle } from '@/lib/dashboard/resolveDashboardStats';
import type { DashboardStats } from '@/lib/dashboard/types';
import { fetchDashboardBundle, type DashboardBundle } from './queries/fetchDashboardBundle';

const SAFE_ERROR_MESSAGE = 'Failed to load dashboard data.';

export type UseDashboardPageParams = {
  periodName: string;
  currentUser: User;
};

function statsFromBundle(bundle: DashboardBundle | undefined): DashboardStats {
  return resolveDashboardStatsFromBundle(bundle) ?? EMPTY_DASHBOARD_STATS;
}

export function useDashboardPage({ periodName, currentUser }: UseDashboardPageParams) {
  const userId = currentUser.id;
  const trimmedPeriod = periodName.trim();

  const cachedBundle = useMemo(
    () => (trimmedPeriod ? readCachedDashboardBundle(trimmedPeriod, userId) : undefined),
    [trimmedPeriod, userId],
  );

  const initialBundle = cachedBundle;

  const query = useQuery({
    queryKey: queryKeys.dashboard.bundle(trimmedPeriod, userId),
    queryFn: async () => {
      const bundle = await fetchDashboardBundle(trimmedPeriod, userId);
      const resolved = statsFromBundle(bundle);
      writeCachedDashboardStats(trimmedPeriod, userId, resolved);
      if (bundle.serverSnapshot) {
        writeCachedDashboardBundle(trimmedPeriod, userId, bundle);
      }
      return bundle;
    },
    enabled: Boolean(trimmedPeriod),
    staleTime: DASHBOARD_STALE_TIME_MS,
    gcTime: DASHBOARD_GC_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData ?? initialBundle,
  });

  const stats: DashboardStats = useMemo(() => {
    if (query.data) return statsFromBundle(query.data);
    if (initialBundle) return statsFromBundle(initialBundle);
    return EMPTY_DASHBOARD_STATS;
  }, [query.data, initialBundle]);

  const projectCountDisplay = useMemo(() => {
    const fromBundle = query.data?.totalProjectsCount ?? cachedBundle?.totalProjectsCount ?? 0;
    const count = fromBundle > 0 ? fromBundle : stats.projectCount;
    return count.toString();
  }, [query.data?.totalProjectsCount, cachedBundle?.totalProjectsCount, stats.projectCount]);

  const errorMessage =
    query.isError && !query.data && !cachedBundle
      ? SAFE_ERROR_MESSAGE
      : null;

  const isRefreshing = query.isFetching;
  const isBackendEmpty =
    query.isSuccess &&
    Boolean(query.data) &&
    !query.data?.serverSnapshot &&
    !query.data?.budgetPeriod;

  const isBlockingLoad = Boolean(trimmedPeriod) && query.isPending && !query.data && !cachedBundle;

  return {
    stats,
    projectCountDisplay,
    errorMessage,
    hasPeriod: Boolean(trimmedPeriod),
    isBlockingLoad,
    isRefreshing,
    isBackendEmpty,
  };
}
