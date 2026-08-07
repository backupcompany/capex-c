import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as configService from '@/services/configService';
import {
  buildScopeFilterPayload,
  buildScopedArchetypeOptions,
  buildScopedHuOptions,
} from '@/lib/scopedFilterOptions';
import { useViewportTablePageSize } from '@/lib/table/useViewportTablePageSize';
import { useFsUpdateMetaQuery, useFsUpdateTableQuery } from '@/hooks/useFsUpdateTableQuery';
import type { UserScopesForCapex } from '@/lib/capexProjectListScope';
import type { SortOption } from '../fsUpdateHelpers';

const STALE_MS = 120_000;

export type FsUpdatePageDataConfig = {
  periodName: string;
  userId: number;
  canView: boolean;
  userScopes: UserScopesForCapex;
  tableScrollHostRef: RefObject<HTMLDivElement | null>;
  debouncedSearch: string;
  isSearchStaging: boolean;
  selectedHUs: string[];
  sortBy: SortOption;
  showOnlyNotFSApproved: boolean;
  focusNeedingApproval: boolean;
  meetingArchetype: string | null;
  currentPage: number;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
  pageSizeOverride: number | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
};

export function useFsUpdatePageData({
  periodName,
  userId,
  canView,
  userScopes,
  tableScrollHostRef,
  debouncedSearch,
  isSearchStaging,
  selectedHUs,
  sortBy,
  showOnlyNotFSApproved,
  focusNeedingApproval,
  meetingArchetype,
  currentPage,
  setCurrentPage,
  pageSizeOverride,
  showToast,
}: FsUpdatePageDataConfig) {
  const queryClient = useQueryClient();
  const { pageSize: viewportPageSize, maxHeightPx } = useViewportTablePageSize(tableScrollHostRef);
  const itemsPerPage = pageSizeOverride ?? viewportPageSize;

  const [masterArchetypes, setMasterArchetypes] = useState<
    Awaited<ReturnType<typeof configService.getAllArchetypesConfig>>
  >([]);
  const [masterHus, setMasterHus] = useState<
    Awaited<ReturnType<typeof configService.getAllHospitalUnitsConfig>>
  >([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      configService.getAllArchetypesConfig(),
      configService.getAllHospitalUnitsConfig(),
    ]).then(([archetypes, hus]) => {
      if (!cancelled) {
        setMasterArchetypes(archetypes);
        setMasterHus(hus);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const scopeFilter = useMemo(
    () => buildScopeFilterPayload(userScopes, masterArchetypes, masterHus),
    [userScopes, masterArchetypes, masterHus],
  );

  const metaQuery = useFsUpdateMetaQuery(periodName, userId, canView, scopeFilter, STALE_MS);

  const {
    tableQuery,
    rows: serverRows,
    totalCount,
    totalPages,
    isBlockingLoad,
    isTableFetching,
  } = useFsUpdateTableQuery({
    periodName,
    userId,
    canView,
    page: currentPage,
    pageSize: itemsPerPage,
    debouncedSearch,
    selectedHUs,
    sortBy,
    showOnlyNotFSApproved,
    focusNeedingApproval,
    meetingArchetype,
    scopeFilter,
    staleTime: STALE_MS,
  });

  const fsSummary = metaQuery.data?.summary ?? {
    submittedQty: 0,
    submittedAmountIdr: 0,
    approvedQty: 0,
    approvedAmountIdr: 0,
    notApprovedQty: 0,
  };

  const filterOptions = useMemo(() => {
    const base = metaQuery.data?.filterOptions ?? tableQuery.data?.filterOptions ?? { archetypes: [], hus: [] };
    if (userScopes.all) return base;

    const scopedArch = buildScopedArchetypeOptions(masterArchetypes, userScopes, masterHus);
    const scopedHu = buildScopedHuOptions(masterHus, masterArchetypes, userScopes);
    const archSet = new Set(scopedArch);
    const huSet = new Set(scopedHu);

    return {
      archetypes:
        scopedArch.length > 0
          ? base.archetypes.filter((a) => archSet.has(a))
          : base.archetypes.filter((a) => userScopes.archetypes.has(a)),
      hus:
        scopedHu.length > 0
          ? base.hus.filter((h) => huSet.has(h))
          : base.hus.filter((h) => userScopes.hus.has(h)),
    };
  }, [metaQuery.data?.filterOptions, tableQuery.data?.filterOptions, userScopes, masterArchetypes, masterHus]);

  const scopedArchetypeOptions = useMemo(
    () => buildScopedArchetypeOptions(masterArchetypes, userScopes, masterHus),
    [masterArchetypes, masterHus, userScopes],
  );

  const huOptions = useMemo(
    () => buildScopedHuOptions(masterHus, masterArchetypes, userScopes),
    [masterHus, masterArchetypes, userScopes],
  );

  const showTableBusy = serverRows.length > 0 && (isTableFetching || isSearchStaging);
  const footerTotalCount = totalCount;
  const showPagination = footerTotalCount > itemsPerPage;
  const tableMaxHeight = `min(70vh, ${maxHeightPx}px)`;
  const isMetaLoading = metaQuery.isPending && !metaQuery.data;

  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage, setCurrentPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages, setCurrentPage]);

  useEffect(() => {
    if (tableQuery.isError) {
      console.error('Error loading FS Update data:', tableQuery.error);
      showToast('Failed to load project data.', 'error');
    }
  }, [tableQuery.isError, tableQuery.error, showToast]);

  useEffect(() => {
    if (metaQuery.isError) {
      console.error('Error loading FS Update meta:', metaQuery.error);
    }
  }, [metaQuery.isError, metaQuery.error]);

  const invalidateFsUpdateQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['screen', 'fs-update', 'query', periodName, userId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['screen', 'fs-update', 'meta', periodName, userId],
      }),
    ]);
  }, [queryClient, periodName, userId]);

  return {
    metaQuery,
    tableQuery,
    serverRows,
    fsSummary,
    filterOptions,
    scopedArchetypeOptions,
    huOptions,
    totalCount,
    totalPages,
    isBlockingLoad,
    isTableFetching,
    showTableBusy,
    footerTotalCount,
    showPagination,
    tableMaxHeight,
    itemsPerPage,
    viewportPageSize,
    isMetaLoading,
    invalidateFsUpdateQueries,
  };
}
