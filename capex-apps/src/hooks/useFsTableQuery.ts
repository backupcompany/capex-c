import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EnrichedFS } from '@/hooks/queries/fetchFsApprovalPageData';
import {
  fetchFsApprovalQueryFromBackend,
  fetchFsRealizationQueryFromBackend,
  type FsQueryPageResult,
  type FsScopeFilterPayload,
} from '@/services/fsApi';
import { useDebouncedValue } from '@/screens/BudgetHU/useDebouncedValue';

export type FsTableQueryParams = {
  periodName: string;
  userId: number;
  canView: boolean;
  page: number;
  pageSize: number;
  search: string;
  searchDebounceMs?: number;
  archetypes: string[];
  hus: string[];
  categories?: string[];
  paybackMin?: number;
  paybackMax?: number;
  sortBy: string;
  scopeFilter: FsScopeFilterPayload;
  screen: 'approval' | 'realization';
  staleTime?: number;
};

const DEFAULT_STALE_MS = 120_000;

export function useFsTableQuery({
  periodName,
  userId,
  canView,
  page,
  pageSize,
  search,
  searchDebounceMs = 200,
  archetypes,
  hus,
  categories = [],
  paybackMin,
  paybackMax,
  sortBy,
  scopeFilter,
  screen,
  staleTime = DEFAULT_STALE_MS,
}: FsTableQueryParams) {
  const debouncedSearch = useDebouncedValue(search, searchDebounceMs);
  const isSearchStaging = search.trim() !== debouncedSearch.trim();

  const queryKey = useMemo(
    () => [
      'screen',
      screen === 'approval' ? 'fs-approval' : 'fs-realization',
      'query',
      periodName,
      userId,
      page,
      pageSize,
      debouncedSearch,
      archetypes.join('\0'),
      hus.join('\0'),
      categories.join('\0'),
      paybackMin ?? '',
      paybackMax ?? '',
      sortBy,
      scopeFilter?.archetypeNames.join('\0') ?? '',
      scopeFilter?.huNames.join('\0') ?? '',
    ] as const,
    [
      screen,
      periodName,
      userId,
      page,
      pageSize,
      debouncedSearch,
      archetypes,
      hus,
      categories,
      paybackMin,
      paybackMax,
      sortBy,
      scopeFilter,
    ],
  );

  const tableQuery = useQuery<FsQueryPageResult, Error>({
    queryKey,
    queryFn: async () => {
      const body = {
        periodName,
        userId,
        page,
        pageSize,
        search: debouncedSearch,
        archetypes,
        hus,
        categories,
        paybackMin,
        paybackMax,
        sortBy,
        scopeFilter,
      };
      const result =
        screen === 'approval'
          ? await fetchFsApprovalQueryFromBackend(body)
          : await fetchFsRealizationQueryFromBackend(body);
      if (!result) {
        throw new Error(`Failed to load FS ${screen} table for ${periodName}`);
      }
      return result;
    },
    enabled: !!periodName.trim() && canView,
    staleTime,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const rows = (tableQuery.data?.rows ?? []) as EnrichedFS[];
  const totalCount = tableQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const filterOptions = tableQuery.data?.filterOptions ?? { archetypes: [], hus: [], categories: [] };

  const isBlockingLoad = tableQuery.isPending && rows.length === 0;
  const isBackgroundRefresh =
    rows.length > 0 && tableQuery.isFetching && !tableQuery.isPending && !isSearchStaging;
  const isFilterRefreshing =
    isSearchStaging || (debouncedSearch.trim().length > 0 && (tableQuery.isFetching || tableQuery.isPending));

  return {
    tableQuery,
    rows,
    totalCount,
    totalPages,
    filterOptions,
    debouncedSearch,
    isSearchStaging,
    isBlockingLoad,
    isBackgroundRefresh,
    isFilterRefreshing,
  };
}
