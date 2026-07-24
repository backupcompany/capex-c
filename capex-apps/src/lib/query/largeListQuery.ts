/**
 * Shared TanStack Query defaults for screens that load thousands of rows.
 * Apply per-query — do not change global AppProviders defaults (bootstrap stays 24h).
 */

/** Data considered fresh; refetch only after invalidation or stale window. */
export const LARGE_LIST_STALE_MS = 2 * 60_000;

/** Drop unused pages from memory sooner than bootstrap (24h). */
export const LARGE_LIST_GC_MS = 10 * 60_000;

/** Cap infinite-query pages kept in memory (automatic GC for old pages). */
export const LARGE_LIST_INFINITE_MAX_PAGES = 5;

export type LargeListPageResult = {
  page: number;
  totalCount?: number;
  hasMore?: boolean;
  totalPages?: number;
};

/** Flatten `useInfiniteQuery` pages into a single array. */
export function flattenInfinitePages<TPage, TItem>(
  pages: TPage[] | undefined,
  selectItems: (page: TPage) => TItem[],
): TItem[] {
  if (!pages?.length) return [];
  return pages.flatMap(selectItems);
}

/** Standard next-page param from a paginated API response. */
export function getLargeListNextPageParam(lastPage: LargeListPageResult): number | undefined {
  if (lastPage.hasMore === false) return undefined;
  if (typeof lastPage.totalPages === 'number' && lastPage.page >= lastPage.totalPages) {
    return undefined;
  }
  if (lastPage.hasMore === true) return lastPage.page + 1;
  return undefined;
}

/** Defaults for server-paginated `useQuery` (page buttons, one page in cache key). */
export function largeListQueryOptions() {
  return {
    staleTime: LARGE_LIST_STALE_MS,
    gcTime: LARGE_LIST_GC_MS,
    refetchOnWindowFocus: false as const,
    refetchOnReconnect: true as const,
  };
}

/** Defaults for `useInfiniteQuery` (Load More / infinite scroll). */
export function largeListInfiniteQueryOptions() {
  return {
    ...largeListQueryOptions(),
    maxPages: LARGE_LIST_INFINITE_MAX_PAGES,
  };
}
