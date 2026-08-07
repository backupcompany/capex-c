import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { isBackendConfigured } from '@/lib/backendApiClient';
import {
  fetchUserMonitoringScreenFromBackend,
  userMonitoringFiltersCacheKey,
  type UserMonitoringListFilters,
} from '@/services/userMonitoringApi';
import { useToast } from '@/contexts/ToastContext';
import type { UserActivityMetric } from '@/types';
import { normalizeUserMonitoringSearch } from '../userMonitoringFormatters';

export const USER_MONITORING_STALE_MS = 60_000;
export const USER_MONITORING_REFETCH_MS = 90_000;
export const USER_MONITORING_LIVE_TICK_MS = 60_000;

export type UserMonitoringPageDataConfig = {
  userId: number;
  canView: boolean;
  debouncedSearch: string;
  isSearchStaging: boolean;
  statusFilter: UserMonitoringListFilters['status'];
  selectedUnit: string | null;
  currentPage: number;
  itemsPerPage: number;
};

export function useUserMonitoringPageData({
  userId,
  canView,
  debouncedSearch,
  isSearchStaging,
  statusFilter,
  selectedUnit,
  currentPage,
  itemsPerPage,
}: UserMonitoringPageDataConfig) {
  const { showToast } = useToast();
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setLiveNowMs(Date.now()), USER_MONITORING_LIVE_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const listFilters = useMemo<UserMonitoringListFilters>(
    () => ({
      search: normalizeUserMonitoringSearch(debouncedSearch),
      status: statusFilter,
      archetypeName: null,
      unitName: selectedUnit,
    }),
    [debouncedSearch, statusFilter, selectedUnit],
  );

  const filtersKey = useMemo(
    () => userMonitoringFiltersCacheKey(listFilters),
    [listFilters],
  );

  const screenQuery = useQuery({
    queryKey: queryKeys.userMonitoring.screen(userId, filtersKey, currentPage, itemsPerPage),
    queryFn: async () => {
      const fromBe = await fetchUserMonitoringScreenFromBackend({
        userId,
        page: currentPage,
        pageSize: itemsPerPage,
        ...listFilters,
      });
      if (fromBe) return fromBe;
      if (isBackendConfigured()) {
        throw new Error('Gagal memuat User Monitoring dari backend.');
      }
      return {
        bundle: {
          summary: {
            totalUsers: 0,
            onlineNow: 0,
            activeUsers: 0,
            dormantUsers: 0,
            inactiveUsers: 0,
          },
          archetypeSummary: [],
          unitSummary: [],
          unitNames: [],
        },
        usersPage: { rows: [], page: currentPage, pageSize: itemsPerPage, totalCount: 0, hasMore: false },
      };
    },
    enabled: canView,
    staleTime: USER_MONITORING_STALE_MS,
    refetchInterval: USER_MONITORING_REFETCH_MS,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  const tableRows = (screenQuery.data?.usersPage.rows ?? []) as UserActivityMetric[];
  const totalCount = screenQuery.data?.usersPage.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const showPagination = totalCount > itemsPerPage;

  const isBlockingLoad =
    screenQuery.isPending && tableRows.length === 0 && !screenQuery.isPlaceholderData;
  const isTableFetching = screenQuery.isFetching && !screenQuery.isPending;
  const showTableBusy = !isBlockingLoad && (isTableFetching || isSearchStaging);

  const isBundleLoading = isBlockingLoad;

  useEffect(() => {
    if (!screenQuery.isError) return;
    const msg =
      screenQuery.error instanceof Error ? screenQuery.error.message : 'Gagal memuat daftar pengguna.';
    showToast(msg, 'error');
  }, [screenQuery.isError, screenQuery.error, showToast]);

  const summary = screenQuery.data?.bundle.summary ?? {
    totalUsers: totalCount,
    onlineNow: tableRows.filter((r) => r.isOnline).length,
    activeUsers: tableRows.filter((r) => r.status === 'Active').length,
    dormantUsers: tableRows.filter((r) => r.status === 'Dormant').length,
    inactiveUsers: tableRows.filter((r) => r.status === 'Inactive').length,
  };

  const unitOptions = useMemo(
    () => screenQuery.data?.bundle.unitNames ?? [],
    [screenQuery.data?.bundle.unitNames],
  );

  const refreshAll = useCallback(async () => {
    await screenQuery.refetch();
  }, [screenQuery]);

  const hasActiveFilters =
    normalizeUserMonitoringSearch(debouncedSearch).length > 0 ||
    statusFilter !== 'all' ||
    selectedUnit != null;

  return {
    screenQuery,
    tableQuery: screenQuery,
    tableRows,
    totalCount,
    totalPages,
    showPagination,
    isBlockingLoad,
    showTableBusy,
    isSearchStaging,
    isBundleLoading,
    summary,
    unitOptions,
    archetypeSummary: screenQuery.data?.bundle.archetypeSummary ?? [],
    unitSummary: screenQuery.data?.bundle.unitSummary ?? [],
    liveNowMs,
    refreshAll,
    hasActiveFilters,
    normalizedSearch: normalizeUserMonitoringSearch(debouncedSearch),
  };
}
