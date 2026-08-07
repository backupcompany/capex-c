import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchGrUpdateAssetWindowFromBackend,
  fetchGrUpdateMasterFromBackend,
  type GrUpdateAssetWindow,
  type GrUpdateWindowFilters,
} from '@/services/grUpdateApi';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { buildGrWindowFilterKey } from '@/screens/GRUpdatePage/grUpdateHelpers';

export const GR_UPDATE_WINDOW_PAGE_SIZE = 50;

type UseGrUpdateWindowQueryParams = {
  userId: number;
  periodName: string;
  filters: GrUpdateWindowFilters;
  enabled: boolean;
};

export function useGrUpdateWindowQuery({
  userId,
  periodName,
  filters,
  enabled,
}: UseGrUpdateWindowQueryParams) {
  const useWindow = isCapexBeConfigured();
  const filterKey = buildGrWindowFilterKey(filters);

  const masterQuery = useQuery({
    queryKey: queryKeys.grUpdate.master(userId, periodName),
    queryFn: async () => {
      const master = await fetchGrUpdateMasterFromBackend(userId, periodName);
      if (!master) throw new Error('Gagal memuat master GR Update.');
      return master;
    },
    enabled: enabled && useWindow && !!periodName.trim(),
    staleTime: 5 * 60_000,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const windowQuery = useInfiniteQuery({
    queryKey: queryKeys.grUpdate.assetWindow(periodName, userId, filterKey),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === 'number' ? pageParam : 1;
      const result = await fetchGrUpdateAssetWindowFromBackend(userId, periodName, {
        page,
        pageSize: GR_UPDATE_WINDOW_PAGE_SIZE,
        filters,
      });
      if (!result) throw new Error('Gagal memuat baris GR Update.');
      return result;
    },
    getNextPageParam: (lastPage: GrUpdateAssetWindow) => {
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
    const assetLastTaskMap: Record<string, string> = {};
    for (const page of pages) {
      Object.assign(assetLastTaskMap, page.assetLastTaskMap);
    }
    const totalAssetCount = pages[0]?.totalAssetCount ?? 0;
    return { assets, assetLastTaskMap, totalAssetCount };
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
