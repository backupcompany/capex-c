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
import type { FsApprovalSortOption } from '../fsApprovalHelpers';

const STALE_MS = 120_000;

export type FsApprovalPageDataConfig = {
  periodName: string;
  userId: number;
  canView: boolean;
  userScopes: UserScopesForCapex;
  debouncedSearch: string;
  isSearchStaging: boolean;
  selectedArchetypes: string[];
  selectedHUs: string[];
  selectedCategories: string[];
  paybackMin: number | undefined;
  paybackMax: number | undefined;
  paybackMinActive: boolean;
  paybackMaxActive: boolean;
  sortBy: FsApprovalSortOption;
  currentPage: number;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
  itemsPerPage: number;
  showToast: (message: string, type?: 'success' | 'error') => void;
};

export function useFsApprovalPageData({
  periodName,
  userId,
  canView,
  userScopes,
  debouncedSearch,
  isSearchStaging,
  selectedArchetypes,
  selectedHUs,
  selectedCategories,
  paybackMin,
  paybackMax,
  paybackMinActive,
  paybackMaxActive,
  sortBy,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  showToast,
}: FsApprovalPageDataConfig) {
  const queryClient = useQueryClient();

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
    canView,
    page: currentPage,
    pageSize: itemsPerPage,
    debouncedSearch,
    isSearchStaging,
    archetypes: selectedArchetypes,
    hus: selectedHUs,
    categories: selectedCategories,
    paybackMin: paybackMinActive ? paybackMin : undefined,
    paybackMax: paybackMaxActive ? paybackMax : undefined,
    sortBy,
    scopeFilter,
    screen: 'approval',
    staleTime: STALE_MS,
  });

  const filterOptions = useMemo(() => {
    const base = {
      archetypes: serverFilterOptions.archetypes,
      hus: serverFilterOptions.hus,
      categories: serverFilterOptions.categories ?? [],
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
      categories: base.categories,
    };
  }, [serverFilterOptions, userScopes, masterArchetypes, masterHus]);

  const footerTotalCount = totalCount;
  const showPagination = footerTotalCount > itemsPerPage;

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages, setCurrentPage]);

  useEffect(() => {
    if (tableQuery.isError) {
      console.error('Error loading FS Approval data:', tableQuery.error);
      showToast('Failed to load FS data.', 'error');
    }
  }, [tableQuery.isError, tableQuery.error, showToast]);

  const invalidateFsApprovalQueries = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['screen', 'fs-approval', 'query', periodName, userId],
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
    invalidateFsApprovalQueries,
  };
}
