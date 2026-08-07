import { useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
  /** Pass debounced value from filter hook; omit to debounce `search` internally. */
  debouncedSearch?: string;
  search?: string;
  searchDebounceMs?: number;
  isSearchStaging?: boolean;
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
  debouncedSearch: debouncedSearchProp,
  search,
  searchDebounceMs = 200,
  isSearchStaging: isSearchStagingProp,
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
  const internalDebounced = useDebouncedValue(search ?? '', searchDebounceMs);
  const debouncedSearch = debouncedSearchProp ?? internalDebounced;
  const isSearchStaging =
    isSearchStagingProp ??
    (search !== undefined && search.trim() !== debouncedSearch.trim());

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
        search: debouncedSearch.trim(),
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
    placeholderData: keepPreviousData,
  });

  const rows = (tableQuery.data?.rows ?? []) as EnrichedFS[];
  const totalCount = tableQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const filterOptions = tableQuery.data?.filterOptions ?? { archetypes: [], hus: [], categories: [] };

  const isBlockingLoad =
    tableQuery.isPending && rows.length === 0 && !tableQuery.isPlaceholderData;
  const isTableFetching = tableQuery.isFetching && !tableQuery.isPending;
  const showTableBusy = !isBlockingLoad && (isTableFetching || isSearchStaging);
  /** @deprecated Prefer showTableBusy — kept for FS Realization until refactored */
  const isBackgroundRefresh = isTableFetching && !isSearchStaging;
  /** @deprecated Prefer showTableBusy + isSearchStaging */
  const isFilterRefreshing = isSearchStaging || showTableBusy;

  return {
    tableQuery,
    rows,
    totalCount,
    totalPages,
    filterOptions,
    isSearchStaging,
    isBlockingLoad,
    isTableFetching,
    showTableBusy,
    isBackgroundRefresh,
    isFilterRefreshing,
  };
}
