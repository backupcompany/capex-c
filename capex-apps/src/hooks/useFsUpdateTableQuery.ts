import { useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { FsEnrichedProject } from '@/hooks/queries/fetchFsUpdatePageData';
import {
  fetchFsUpdateMetaFromBackend,
  fetchFsUpdateQueryFromBackend,
  type FsUpdateQueryBody,
} from '@/services/fsUpdateApi';
import type { FsScopeFilterPayload } from '@/services/fsApi';
import type { SortOption } from '@/screens/FSUpdatePage/fsUpdateHelpers';

export type FsUpdateTableQueryParams = {
  periodName: string;
  userId: number;
  canView: boolean;
  page: number;
  pageSize: number;
  debouncedSearch: string;
  selectedHUs: string[];
  sortBy: SortOption;
  showOnlyNotFSApproved: boolean;
  focusNeedingApproval: boolean;
  meetingArchetype: string | null;
  scopeFilter: FsScopeFilterPayload;
  staleTime?: number;
};

const DEFAULT_STALE_MS = 120_000;

export function useFsUpdateMetaQuery(
  periodName: string,
  userId: number,
  canView: boolean,
  scopeFilter: FsScopeFilterPayload,
  staleTime = DEFAULT_STALE_MS,
) {
  return useQuery({
    queryKey: ['screen', 'fs-update', 'meta', periodName, userId, scopeFilter?.archetypeNames.join('\0') ?? '', scopeFilter?.huNames.join('\0') ?? ''] as const,
    queryFn: async () => {
      const result = await fetchFsUpdateMetaFromBackend(periodName, userId, scopeFilter);
      if (!result) throw new Error(`Failed to load FS Update meta for ${periodName}`);
      return result;
    },
    enabled: !!periodName.trim() && canView,
    staleTime,
    refetchOnWindowFocus: false,
  });
}

export function useFsUpdateTableQuery({
  periodName,
  userId,
  canView,
  page,
  pageSize,
  debouncedSearch,
  selectedHUs,
  sortBy,
  showOnlyNotFSApproved,
  focusNeedingApproval,
  meetingArchetype,
  scopeFilter,
  staleTime = DEFAULT_STALE_MS,
}: FsUpdateTableQueryParams) {
  const queryKey = useMemo(
    () =>
      [
        'screen',
        'fs-update',
        'query',
        periodName,
        userId,
        page,
        pageSize,
        debouncedSearch,
        selectedHUs.join('\0'),
        sortBy,
        showOnlyNotFSApproved,
        focusNeedingApproval,
        meetingArchetype ?? '',
        scopeFilter?.archetypeNames.join('\0') ?? '',
        scopeFilter?.huNames.join('\0') ?? '',
      ] as const,
    [
      periodName,
      userId,
      page,
      pageSize,
      debouncedSearch,
      selectedHUs,
      sortBy,
      showOnlyNotFSApproved,
      focusNeedingApproval,
      meetingArchetype,
      scopeFilter,
    ],
  );

  const tableQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const body: FsUpdateQueryBody = {
        periodName,
        userId,
        page,
        pageSize,
        search: debouncedSearch,
        hus: selectedHUs,
        sortBy,
        showOnlyNotFSApproved,
        focusNeedingApproval,
        meetingArchetype,
        scopeFilter,
      };
      const result = await fetchFsUpdateQueryFromBackend(body);
      if (!result) throw new Error(`Failed to load FS Update table for ${periodName}`);
      return result;
    },
    enabled: !!periodName.trim() && canView,
    staleTime,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const rows = (tableQuery.data?.rows ?? []) as unknown as FsEnrichedProject[];
  const totalCount = tableQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const isBlockingLoad =
    tableQuery.isPending && rows.length === 0 && !tableQuery.isPlaceholderData;
  const isTableFetching = tableQuery.isFetching && !tableQuery.isPending;

  return {
    tableQuery,
    rows,
    totalCount,
    totalPages,
    isBlockingLoad,
    isTableFetching,
  };
}
