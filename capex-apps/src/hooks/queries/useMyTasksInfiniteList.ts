import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  flattenInfinitePages,
  getLargeListNextPageParam,
  largeListInfiniteQueryOptions,
} from '@/lib/query/largeListQuery';
import {
  fetchMyTasksPageBundle,
  MY_TASKS_STALE_MS,
  buildMyTasksQueryKeySuffix,
  type MyTasksPageBundle,
  type MyTasksQueryInput,
} from '@/hooks/queries/fetchMyTasksPage';
import type { User, UserTask } from '@/types';

type MyTasksInfiniteFilters = Omit<MyTasksQueryInput, 'page' | 'pageSize'>;

type UseMyTasksInfiniteListParams = {
  currentUser: User | null;
  periodName: string | undefined;
  filters: MyTasksInfiniteFilters;
  pageSize: number;
  enabled: boolean;
};

export type MyTasksInfiniteListResult = {
  tasks: UserTask[];
  totalCount: number;
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  filterOptions: MyTasksPageBundle['filterOptions'] | undefined;
};

/**
 * Pilot: infinite scroll / Load More for My Tasks (server-paginated BE).
 * Keeps at most `LARGE_LIST_INFINITE_MAX_PAGES` pages in memory via TanStack `maxPages`.
 */
export function useMyTasksInfiniteList({
  currentUser,
  periodName,
  filters,
  pageSize,
  enabled,
}: UseMyTasksInfiniteListParams): MyTasksInfiniteListResult {
  const filtersKey = buildMyTasksQueryKeySuffix({ ...filters, page: 1, pageSize });

  const query = useInfiniteQuery({
    queryKey: currentUser
      ? queryKeys.myTasks.infinite(currentUser.id, periodName, filtersKey)
      : ['screen', 'my-tasks', 'infinite', 'idle'],
    queryFn: async ({ pageParam, signal }) =>
      fetchMyTasksPageBundle(
        currentUser!,
        periodName,
        { ...filters, page: pageParam, pageSize },
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      getLargeListNextPageParam({
        page: lastPage.page,
        totalPages: lastPage.totalPages,
      }),
    enabled: !!currentUser && enabled,
    ...largeListInfiniteQueryOptions(),
    staleTime: MY_TASKS_STALE_MS,
  });

  const tasks = flattenInfinitePages(query.data?.pages, (page) => page.tasks);
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;
  const filterOptions = query.data?.pages[0]?.filterOptions;

  return {
    tasks,
    totalCount,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    filterOptions,
  };
}
