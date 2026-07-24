import type { QueryClient } from '@tanstack/react-query';
import { useBackendSession } from '@/lib/auth/authConstants';
import { useBeBffProxy } from '@/lib/capexBeClient';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchMyTasksPageBundle,
  MY_TASKS_STALE_MS,
  buildMyTasksQueryKeySuffix,
  type MyTasksPageBundle,
  type MyTasksQueryInput,
} from '@/hooks/queries/fetchMyTasksPage';
import type { User } from '@/types';

const DEFAULT_PREFETCH_QUERY: MyTasksQueryInput = {
  page: 1,
  pageSize: 20,
  taskViewMode: 'my_tasks_only',
  showCompleted: false,
  sortBy: 'targetDate_desc',
};

/** Hydrate TanStack Query from disk — client-only fallback when BE off. */
export function hydrateMyTasksFromDisk(
  queryClient: QueryClient,
  userId: number,
  periodName: string | undefined,
): boolean {
  return false;
}

/**
 * Warm my-tasks page 1 on hover / nav.
 */
export function prefetchMyTasksPage(
  queryClient: QueryClient,
  currentUser: User,
  periodName: string | undefined,
): void {
  if (!currentUser?.id) return;

  const querySuffix = buildMyTasksQueryKeySuffix(DEFAULT_PREFETCH_QUERY);
  const qk = queryKeys.myTasks.page(currentUser.id, periodName, querySuffix);

  const state = queryClient.getQueryState<MyTasksPageBundle>(qk);
  if (
    state?.dataUpdatedAt &&
    Date.now() - state.dataUpdatedAt < MY_TASKS_STALE_MS &&
    queryClient.getQueryData(qk)
  ) {
    return;
  }

  const base = process.env.NEXT_PUBLIC_CAPEXBE_URL?.replace(/\/$/, '').trim();
  const bff = useBeBffProxy();
  if (!base && !bff) return;

  void (async () => {
    if (!bff || !useBackendSession()) {
      const token = await getAccessTokenForBackend();
      if (!bff && !token) return;
    }
    await queryClient.prefetchQuery({
      queryKey: qk,
      staleTime: MY_TASKS_STALE_MS,
      queryFn: () => fetchMyTasksPageBundle(currentUser, periodName, DEFAULT_PREFETCH_QUERY),
    });
  })();
}
