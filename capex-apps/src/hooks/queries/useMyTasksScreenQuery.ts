import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { largeListQueryOptions } from '@/lib/query/largeListQuery';
import {
  fetchMyTasksPageBundle,
  MY_TASKS_STALE_MS,
  buildMyTasksQueryKeySuffix,
  type MyTasksPageBundle,
  type MyTasksQueryInput,
} from '@/hooks/queries/fetchMyTasksPage';
import { isCapexBeConfigured } from '@/services/myTasksApi';
import { writeMyTasksCache } from '@/lib/myTasksDiskCache';
import type { User } from '@/types';

type UseMyTasksScreenQueryParams = {
  currentUser: User | null;
  periodName: string | undefined;
  queryInput: MyTasksQueryInput;
  enabled: boolean;
  diskTasksSeed?: MyTasksPageBundle;
  hasWarmSeed: boolean;
};

/**
 * Server-paginated My Tasks list — one page per query key (not infinite yet).
 * Uses shorter gcTime than global defaults so old pages are garbage-collected.
 */
export function useMyTasksScreenQuery({
  currentUser,
  periodName,
  queryInput,
  enabled,
  diskTasksSeed,
  hasWarmSeed,
}: UseMyTasksScreenQueryParams): UseQueryResult<MyTasksPageBundle> {
  const useServerPagination = isCapexBeConfigured();
  const queryKeySuffix = buildMyTasksQueryKeySuffix(queryInput);

  return useQuery({
    queryKey: currentUser
      ? queryKeys.myTasks.page(currentUser.id, periodName, queryKeySuffix)
      : ['screen', 'my-tasks', 'idle'],
    queryFn: async ({ signal }) => {
      const bundle = await fetchMyTasksPageBundle(currentUser!, periodName, queryInput, { signal });
      if (!useServerPagination) {
        writeMyTasksCache(currentUser!.id, periodName, bundle);
      }
      return bundle;
    },
    enabled: !!currentUser && enabled,
    ...largeListQueryOptions(),
    staleTime: MY_TASKS_STALE_MS,
    refetchOnMount: !hasWarmSeed,
    initialData: useServerPagination ? undefined : diskTasksSeed,
    placeholderData: (previousData) =>
      previousData ?? (useServerPagination ? undefined : diskTasksSeed),
  });
}
