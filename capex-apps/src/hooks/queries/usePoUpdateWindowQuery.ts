import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchPoUpdateAssetWindowFromBackend,
  fetchPoUpdateMasterFromBackend,
  type PoUpdateAssetWindow,
  type PoUpdateWindowFilters,
} from '@/services/poUpdateApi';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { buildPoWindowFilterKey } from '@/screens/POUpdatePage/poUpdateHelpers';

export const PO_UPDATE_WINDOW_PAGE_SIZE = 50;

type UsePoUpdateWindowQueryParams = {
  userId: number;
  periodName: string;
  filters: PoUpdateWindowFilters;
  enabled: boolean;
};

export function usePoUpdateWindowQuery({
  userId,
  periodName,
  filters,
  enabled,
}: UsePoUpdateWindowQueryParams) {
  const useWindow = isCapexBeConfigured();
  const filterKey = buildPoWindowFilterKey(filters);

  const masterQuery = useQuery({
    queryKey: queryKeys.poUpdate.master(userId, periodName),
    queryFn: async () => {
      const master = await fetchPoUpdateMasterFromBackend(userId, periodName);
      if (!master) throw new Error('Gagal memuat master PO Update.');
      return master;
    },
    enabled: enabled && useWindow && !!periodName.trim(),
    staleTime: 5 * 60_000,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const windowQuery = useInfiniteQuery({
    queryKey: queryKeys.poUpdate.assetWindow(periodName, userId, filterKey),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === 'number' ? pageParam : 1;
      const result = await fetchPoUpdateAssetWindowFromBackend(userId, periodName, {
        page,
        pageSize: PO_UPDATE_WINDOW_PAGE_SIZE,
        filters,
      });
      if (!result) throw new Error('Gagal memuat baris PO Update.');
      return result;
    },
    getNextPageParam: (lastPage: PoUpdateAssetWindow) => {
      const loaded = lastPage.page * lastPage.pageSize;
      if (loaded >= lastPage.totalAssetCount) return undefined;
      if (lastPage.assets.length < lastPage.pageSize) return undefined;
      return lastPage.page + 1;
    },
    enabled: enabled && useWindow && !!periodName.trim(),
    staleTime: 90_000,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const merged = useMemo(() => {
    const pages = windowQuery.data?.pages ?? [];
    const assets = pages.flatMap((p) => p.assets);
    const projectsById = new Map<string, PoUpdateAssetWindow['projects'][number]>();
    for (const page of pages) {
      for (const project of page.projects) {
        projectsById.set(String(project.id), project);
      }
    }
    const assetHasPOMap: Record<string, boolean> = {};
    const assetLastTaskMap: Record<string, string> = {};
    for (const page of pages) {
      Object.assign(assetHasPOMap, page.assetHasPOMap);
      Object.assign(assetLastTaskMap, page.assetLastTaskMap);
    }
    const totalAssetCount = pages[0]?.totalAssetCount ?? 0;
    return {
      assets,
      projects: Array.from(projectsById.values()),
      assetHasPOMap,
      assetLastTaskMap,
      totalAssetCount,
    };
  }, [windowQuery.data?.pages]);

  const showContentSkeleton =
    windowQuery.isPending && merged.assets.length === 0 && !windowQuery.isPlaceholderData;

  const isBackgroundRefetch =
    (windowQuery.isFetching && merged.assets.length > 0 && !windowQuery.isFetchingNextPage) ||
    (masterQuery.isFetching && !!masterQuery.data);

  return {
    useWindow,
    masterQuery,
    windowQuery,
    merged,
    showContentSkeleton,
    isBackgroundRefetch,
    fetchNextWindow: windowQuery.fetchNextPage,
    hasNextWindow: windowQuery.hasNextPage,
    isFetchingNextWindow: windowQuery.isFetchingNextPage,
  };
}
