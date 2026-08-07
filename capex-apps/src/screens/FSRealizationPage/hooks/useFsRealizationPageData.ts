import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as configService from '@/services/configService';
import {
  buildScopeFilterPayload,
  buildScopedArchetypeOptions,
  buildScopedHuOptions,
} from '@/lib/scopedFilterOptions';
import { useFsTableQuery } from '@/hooks/useFsTableQuery';
import type { UserScopesForCapex } from '@/lib/capexProjectListScope';
import type { FsRealizationSortOption } from '../fsRealizationHelpers';

const STALE_MS = 120_000;

export type FsRealizationPageDataConfig = {
  periodName: string;
  userId: number;
  canView: boolean;
  userScopes: UserScopesForCapex;
  debouncedSearch: string;
  isSearchStaging: boolean;
  selectedArchetypes: string[];
  selectedHUs: string[];
  sortBy: FsRealizationSortOption;
  currentPage: number;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
  itemsPerPage: number;
  showToast: (message: string, type?: 'success' | 'error') => void;
};

export function useFsRealizationPageData({
  periodName,
  userId,
  canView,
  userScopes,
  debouncedSearch,
  isSearchStaging,
  selectedArchetypes,
  selectedHUs,
  sortBy,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  showToast,
}: FsRealizationPageDataConfig) {
  const queryClient = useQueryClient();

  const [masterArchetypes, setMasterArchetypes] = useState<
    Awaited<ReturnType<typeof configService.getAllArchetypesConfig>>
  >([]);
  const [masterHus, setMasterHus] = useState<
    Awaited<ReturnType<typeof configService.getAllHospitalUnitsConfig>>
  >([]);
  const [isMasterConfigLoading, setIsMasterConfigLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsMasterConfigLoading(true);
    void Promise.all([
      configService.getAllArchetypesConfig(),
      configService.getAllHospitalUnitsConfig(),
    ]).then(([archetypes, hus]) => {
      if (!cancelled) {
        setMasterArchetypes(archetypes);
        setMasterHus(hus);
        setIsMasterConfigLoading(false);
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

  const needsScopeResolution =
    !userScopes.all &&
    (userScopes.archetypeIds.size > 0 || userScopes.huIds.size > 0);
  const isScopePending = isMasterConfigLoading && needsScopeResolution;

  const {
    tableQuery,
    rows: serverRows,
    totalCount,
    totalPages,
    filterOptions: serverFilterOptions,
    isBlockingLoad,
    showTableBusy,
  } = useFsTableQuery({
    periodName,
    userId,
    canView: canView && !isScopePending,
    page: currentPage,
    pageSize: itemsPerPage,
    debouncedSearch,
    isSearchStaging,
    archetypes: selectedArchetypes,
    hus: selectedHUs,
    sortBy,
    scopeFilter,
    screen: 'realization',
    staleTime: STALE_MS,
  });

  const filterOptions = useMemo(() => {
    const base = {
      archetypes: serverFilterOptions.archetypes,
      hus: serverFilterOptions.hus,
    };
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
  }, [serverFilterOptions, userScopes, masterArchetypes, masterHus]);

  const footerTotalCount = totalCount;
  const showPagination = footerTotalCount > itemsPerPage;

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages, setCurrentPage]);

  useEffect(() => {
    if (tableQuery.isError) {
      console.error('Error loading FS Realization data:', tableQuery.error);
      showToast('Failed to load FS data.', 'error');
    }
  }, [tableQuery.isError, tableQuery.error, showToast]);

  const invalidateFsRealizationQueries = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['screen', 'fs-realization', 'query', periodName, userId],
    });
  }, [queryClient, periodName, userId]);

  return {
    tableQuery,
    serverRows,
    filterOptions,
    totalCount,
    totalPages,
    isBlockingLoad,
    showTableBusy,
    footerTotalCount,
    showPagination,
    isScopePending,
    isMasterConfigLoading,
    masterArchetypes,
    masterHus,
    invalidateFsRealizationQueries,
  };
}
