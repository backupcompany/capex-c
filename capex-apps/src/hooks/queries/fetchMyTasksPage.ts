import type { QueryClient } from '@tanstack/react-query';
import type { ArchetypeConfig, HospitalUnitConfig, User, UserTask } from '@/types';
import * as taskService from '@/services/taskService';
import * as configService from '@/services/configService';
import {
  fetchMyTasksOpenForNotifications,
  fetchMyTasksPage,
  isCapexBeConfigured,
  resolveMyTasksAccessToken,
  type MyTasksFilterOptions,
  type MyTasksListParams,
} from '@/services/myTasksApi';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { CapexBeHttpError, isCapexBeNetworkError, useBeBffProxy } from '@/lib/capexBeClient';
import { isAxiosCanceled } from '@/lib/http/capexBeAxios';
import { useBackendSession } from '@/lib/auth/authConstants';
import { queryKeys } from '@/lib/query-keys';
import { withRequestCache } from '@/lib/requestCache';
import type { MyTaskViewMode } from '@/screens/MyTask/listUtils';

/** Shared stale window for my-tasks query, prefetch, and notification polling. */
export const MY_TASKS_STALE_MS = 5 * 60 * 1000;

const FILTER_MASTER_TTL_MS = 30 * 60 * 1000;

export type MyTasksPageBundle = {
  masterData: { archetypes: ArchetypeConfig[]; hus: HospitalUnitConfig[] };
  tasks: UserTask[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filterOptions: MyTasksFilterOptions;
};

export type MyTasksFilterMasterData = {
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
};

export type MyTasksQueryInput = MyTasksListParams & {
  taskViewMode: MyTaskViewMode;
};

export function buildMyTasksQueryKeySuffix(params: MyTasksQueryInput): string {
  const parts = [
    `p${params.page ?? 1}`,
    `s${params.pageSize ?? 20}`,
    params.taskViewMode,
    params.showCompleted ? 'done1' : 'done0',
    params.sortBy ?? 'targetDate_desc',
    (params.search ?? '').trim().toLowerCase(),
    ...(params.selectedArchetypes ?? []).sort(),
    ...(params.selectedHUs ?? []).sort(),
    ...(params.selectedAssignedRoles ?? []).sort(),
  ];
  return parts.join('|');
}

function requestCacheKey(
  userId: number,
  periodName: string | undefined,
  querySuffix: string,
): string {
  return `my-tasks:page:${userId}:${periodName?.trim() ?? ''}:${querySuffix}`;
}

async function loadMyTasksPage(
  currentUser: User,
  periodName: string | undefined,
  params: MyTasksQueryInput,
  options?: { skipCache?: boolean; signal?: AbortSignal },
): Promise<MyTasksPageBundle> {
  const skipCache = !!options?.skipCache;
  const querySuffix = buildMyTasksQueryKeySuffix(params);
  const cacheKey = skipCache
    ? `${requestCacheKey(currentUser.id, periodName, querySuffix)}:skip`
    : requestCacheKey(currentUser.id, periodName, querySuffix);

  return withRequestCache(
    cacheKey,
    async () => {
      if (isCapexBeConfigured()) {
        const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
        if (!useBeBffProxy() && !token && !useBackendSession()) {
          throw new Error('Sesi tidak valid — login ulang untuk memuat task.');
        }
        try {
          const data = await fetchMyTasksPage(
            currentUser.id,
            token,
            periodName,
            params,
            skipCache,
            { signal: options?.signal },
          );
          return {
            masterData: { archetypes: [], hus: [] },
            tasks: data.tasks ?? [],
            totalCount: data.totalCount ?? 0,
            page: data.page ?? 1,
            pageSize: data.pageSize ?? params.pageSize ?? 20,
            totalPages: data.totalPages ?? 1,
            filterOptions: data.filterOptions ?? {
              archetypeNames: [],
              huNames: [],
              assignedRoleNames: [],
            },
          };
        } catch (beErr) {
          if (isAxiosCanceled(beErr)) throw beErr;
          if (isCapexBeNetworkError(beErr)) {
            console.warn('My tasks BE unreachable, using direct Supabase path:', beErr);
            const tasks = await taskService.getTasksForUser(currentUser);
            return {
              masterData: { archetypes: [], hus: [] },
              tasks,
              totalCount: tasks.length,
              page: 1,
              pageSize: tasks.length,
              totalPages: 1,
              filterOptions: { archetypeNames: [], huNames: [], assignedRoleNames: [] },
            };
          }
          if (beErr instanceof CapexBeHttpError && beErr.status === 401) {
            throw beErr;
          }
          console.error('My tasks BE failed:', beErr);
          throw beErr instanceof Error ? beErr : new Error(String(beErr));
        }
      }
      const tasks = await taskService.getTasksForUser(currentUser);
      return {
        masterData: { archetypes: [], hus: [] },
        tasks,
        totalCount: tasks.length,
        page: 1,
        pageSize: tasks.length,
        totalPages: 1,
        filterOptions: { archetypeNames: [], huNames: [], assignedRoleNames: [] },
      };
    },
    MY_TASKS_STALE_MS,
  );
}

/**
 * Personal open tasks for notification polling — lightweight BE endpoint.
 */
export async function resolveMyTasksForNotifications(
  currentUser: User,
  periodName: string | undefined,
): Promise<UserTask[]> {
  if (isCapexBeConfigured()) {
    const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
    try {
      const data = await fetchMyTasksOpenForNotifications(currentUser.id, token, periodName);
      return data.tasks ?? [];
    } catch (beErr) {
      if (!isCapexBeNetworkError(beErr)) throw beErr;
    }
  }
  return taskService.getTasksForUser(currentUser);
}

/**
 * @deprecated Prefer paginated fetchMyTasksPageBundle with explicit query params.
 */
export async function resolveMyTasksForUser(
  queryClient: QueryClient,
  currentUser: User,
  periodName: string | undefined,
  options?: { forceRefresh?: boolean },
): Promise<UserTask[]> {
  const defaultQuery: MyTasksQueryInput = {
    page: 1,
    pageSize: 200,
    taskViewMode: 'my_tasks_only',
    showCompleted: false,
    sortBy: 'targetDate_asc',
  };
  const queryKey = queryKeys.myTasks.page(
    currentUser.id,
    periodName,
    buildMyTasksQueryKeySuffix(defaultQuery),
  );

  if (!options?.forceRefresh) {
    const cached = queryClient.getQueryData<MyTasksPageBundle>(queryKey);
    if (cached?.tasks) return cached.tasks;
  }

  const bundle = await queryClient.fetchQuery({
    queryKey,
    queryFn: () => fetchMyTasksPageBundle(currentUser, periodName, defaultQuery),
    staleTime: MY_TASKS_STALE_MS,
  });
  return bundle.tasks;
}

export async function fetchMyTasksPageBundle(
  currentUser: User,
  periodName: string | undefined,
  params: MyTasksQueryInput,
  options?: { skipCache?: boolean; signal?: AbortSignal },
): Promise<MyTasksPageBundle> {
  return loadMyTasksPage(currentUser, periodName, params, options);
}

/** Lazy-loaded when user opens filter panel — cached via TanStack Query + requestCache. */
export async function fetchMyTasksFilterMasterData(): Promise<MyTasksFilterMasterData> {
  return withRequestCache(
    'my-tasks:filter-master',
    async () => {
      const [archetypes, hus] = await Promise.all([
        configService.getAllArchetypesConfig(),
        configService.getAllHospitalUnitsConfig(),
      ]);
      return { archetypes, hus };
    },
    FILTER_MASTER_TTL_MS,
  );
}
