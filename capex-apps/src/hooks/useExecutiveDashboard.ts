import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { Archetype } from '../types';
import { isBackendConfigured } from '../lib/backendApiClient';
import { queryKeys } from '../lib/query-keys';
import { buildFiltersKey, mapPeriodHeaderFromMeta } from '../lib/executiveSummary/selectors';
import {
  EMPTY_EXECUTIVE_DASHBOARD,
  type ExecutiveDashboardMetrics,
} from '../lib/executiveSummary/dashboardTypes';
import type { ExecutiveSummaryPeriodForHeader } from '../lib/executiveSummary/types';
import { normalizeExecutiveDashboardMetrics } from '../lib/executiveSummary/normalizeDashboardMetrics';
import {
  readExecutiveDashboardDataCache,
  writeExecutiveDashboardDataCache,
} from '../lib/executiveDashboardDiskCache';
import {
  fetchExecutiveDashboardChartsFromBackend,
  fetchExecutiveDashboardKpiFromBackend,
} from '../services/executiveSummaryApi';

const KPI_STALE_MS = 60_000;
const CHARTS_STALE_MS = 60_000;

export type UseExecutiveDashboardParams = {
  periodName: string;
  userId: number;
  selectedArchetypeId: string | null;
};

function periodHeaderFallback(periodName: string): ExecutiveSummaryPeriodForHeader {
  return {
    periodName,
    startDate: '',
    endDate: '',
    multiYearName: '',
  };
}

const DEFAULT_FILTER_BODY = {
  capexType: 'all' as const,
  status: 'all' as const,
  huCodes: [] as string[],
};

export function useExecutiveDashboard({
  periodName,
  userId,
  selectedArchetypeId,
}: UseExecutiveDashboardParams) {
  const filtersKey = useMemo(
    () =>
      buildFiltersKey({
        archetypeId: selectedArchetypeId,
        ...DEFAULT_FILTER_BODY,
      }),
    [selectedArchetypeId],
  );

  const filterBody = useMemo(
    () => ({
      archetypeId: selectedArchetypeId,
      ...DEFAULT_FILTER_BODY,
    }),
    [selectedArchetypeId],
  );

  const diskCache = useMemo(
    () => readExecutiveDashboardDataCache(periodName, userId, filtersKey),
    [periodName, userId, filtersKey],
  );

  const queryEnabled = Boolean(periodName);
  const prevFiltersKeyRef = useRef(filtersKey);
  const [isFilterTransition, setIsFilterTransition] = useState(false);

  const kpiQuery = useQuery({
    queryKey: queryKeys.executiveSummary.dashboardKpi(periodName, userId, filtersKey),
    queryFn: async () => {
      if (isBackendConfigured()) {
        const data = await fetchExecutiveDashboardKpiFromBackend(periodName, userId, filterBody);
        if (data) return data;
        throw new Error('Gagal memuat KPI Executive Dashboard.');
      }
      return { summary: EMPTY_EXECUTIVE_DASHBOARD.summary, periodMeta: null, updatedAt: '' };
    },
    enabled: queryEnabled,
    initialData: diskCache?.kpi,
    initialDataUpdatedAt: diskCache?.savedAt,
    staleTime: KPI_STALE_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const chartsQuery = useQuery({
    queryKey: queryKeys.executiveSummary.dashboardCharts(periodName, userId, filtersKey),
    queryFn: async () => {
      if (isBackendConfigured()) {
        const data = await fetchExecutiveDashboardChartsFromBackend(periodName, userId, filterBody);
        if (data) return data;
        throw new Error('Gagal memuat grafik Executive Dashboard.');
      }
      return {
        budgetByUnit: [],
        capexStatus: EMPTY_EXECUTIVE_DASHBOARD.capexStatus,
        categoryBreakdown: [],
        monthlyTrend: [],
        topInvestments: [],
        alerts: [],
        updatedAt: '',
      };
    },
    enabled: queryEnabled,
    initialData: diskCache?.charts,
    initialDataUpdatedAt: diskCache?.savedAt,
    staleTime: CHARTS_STALE_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (kpiQuery.data && chartsQuery.data && kpiQuery.isSuccess && chartsQuery.isSuccess) {
      writeExecutiveDashboardDataCache(
        periodName,
        userId,
        filtersKey,
        kpiQuery.data,
        chartsQuery.data,
      );
    }
  }, [kpiQuery.data, chartsQuery.data, kpiQuery.isSuccess, chartsQuery.isSuccess, periodName, userId, filtersKey]);

  const metrics: ExecutiveDashboardMetrics = useMemo(() => {
    return normalizeExecutiveDashboardMetrics({
      summary: kpiQuery.data?.summary,
      periodMeta: kpiQuery.data?.periodMeta,
      updatedAt: kpiQuery.data?.updatedAt ?? chartsQuery.data?.updatedAt,
      budgetByUnit: chartsQuery.data?.budgetByUnit,
      capexStatus: chartsQuery.data?.capexStatus,
      categoryBreakdown: chartsQuery.data?.categoryBreakdown,
      monthlyTrend: chartsQuery.data?.monthlyTrend,
      topInvestments: chartsQuery.data?.topInvestments,
      alerts: chartsQuery.data?.alerts,
    });
  }, [kpiQuery.data, chartsQuery.data]);

  const periodHeader: ExecutiveSummaryPeriodForHeader = useMemo(() => {
    return (
      mapPeriodHeaderFromMeta(metrics.periodMeta) ??
      (periodName ? periodHeaderFallback(periodName) : null)
    );
  }, [metrics.periodMeta, periodName]);

  const isLoadingRemote =
    kpiQuery.isPending || chartsQuery.isPending || kpiQuery.isFetching || chartsQuery.isFetching;
  const newDataReady =
    kpiQuery.isSuccess &&
    chartsQuery.isSuccess &&
    !kpiQuery.isFetching &&
    !chartsQuery.isFetching;

  useLayoutEffect(() => {
    if (prevFiltersKeyRef.current === filtersKey) return;
    setIsFilterTransition(true);
    prevFiltersKeyRef.current = filtersKey;
  }, [filtersKey]);

  useEffect(() => {
    if (newDataReady || kpiQuery.isError || chartsQuery.isError) {
      setIsFilterTransition(false);
    }
  }, [newDataReady, kpiQuery.isError, chartsQuery.isError]);

  const hasDisplayData = Boolean(kpiQuery.data && chartsQuery.data);

  /** Skeleton — first load or filter change. */
  const showDashboardSkeleton =
    isFilterTransition || (isLoadingRemote && !hasDisplayData);
  const showMetricsContent = hasDisplayData && !showDashboardSkeleton;

  const isError = kpiQuery.isError || chartsQuery.isError;

  const errorMessage = isError
    ? (kpiQuery.error instanceof Error
        ? kpiQuery.error.message
        : chartsQuery.error instanceof Error
          ? chartsQuery.error.message
          : 'Failed to load executive dashboard.')
    : null;

  const hasNoDashboardData =
    metrics.summary.totalBudget === 0 &&
    metrics.summary.budgetAllocationToProject === 0 &&
    metrics.summary.totalCapexSubmission === 0 &&
    metrics.budgetByUnit.length === 0;

  return {
    periodHeader,
    metrics,
    isLoading: showDashboardSkeleton,
    isMetricsLoading: showDashboardSkeleton,
    isInitialLoad: showDashboardSkeleton && !isFilterTransition,
    isRefreshing: false,
    showDashboardSkeleton,
    showMetricsContent,
    errorMessage,
    hasPeriod: Boolean(periodName),
    hasNoDashboardData: showMetricsContent && !errorMessage && hasNoDashboardData,
    filtersKey,
  };
}

export type { ExecutiveDashboardMetrics, Archetype };
