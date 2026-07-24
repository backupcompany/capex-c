import type { UserTask } from '../types';
import type { MyTaskSortOption, MyTaskViewMode } from '@/screens/MyTask/listUtils';
import { CapexBeHttpError, isCapexBeConfigured, postToCapexBe, useBeBffProxy } from '../lib/capexBeClient';
import { useBackendSession } from '../lib/auth/authConstants';
import { parseApiResponseOrFallback } from '../lib/validation/parseApiResponse';
import {
  EMPTY_MY_TASKS_PAGE,
  myTasksOpenResponseSchema,
  myTasksPageResponseSchema,
} from '../lib/validation/schemas/myTasks.schema';

export { isCapexBeConfigured, CapexBeHttpError };

export type MyTasksFilterOptions = {
  archetypeNames: string[];
  huNames: string[];
  assignedRoleNames: string[];
};

export type MyTasksListParams = {
  page?: number;
  pageSize?: number;
  taskViewMode?: MyTaskViewMode;
  showCompleted?: boolean;
  search?: string;
  selectedArchetypes?: string[];
  selectedHUs?: string[];
  selectedAssignedRoles?: string[];
  sortBy?: MyTaskSortOption;
};

export type MyTasksPageResponse = {
  tasks: UserTask[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filterOptions: MyTasksFilterOptions;
};

/** Paginated my-tasks — filters and sort applied server-side. */
export async function fetchMyTasksPage(
  userId: number,
  accessToken: string | null | undefined,
  periodName: string | undefined,
  params: MyTasksListParams,
  skipCache = false,
  options?: { signal?: AbortSignal },
): Promise<MyTasksPageResponse> {
  const raw = await postToCapexBe<unknown>(
    '/my-tasks',
    {
      userId,
      periodName: periodName?.trim() || undefined,
      ...(skipCache ? { skipCache: true } : {}),
      ...params,
    },
    accessToken,
    { signal: options?.signal },
  );
  return parseApiResponseOrFallback(
    'my-tasks/page',
    myTasksPageResponseSchema,
    raw,
    EMPTY_MY_TASKS_PAGE,
  );
}

/** Personal open tasks for notification polling (capped, no org-wide flood). */
export async function fetchMyTasksOpenForNotifications(
  userId: number,
  accessToken: string | null | undefined,
  periodName?: string,
): Promise<{ tasks: UserTask[] }> {
  const raw = await postToCapexBe<unknown>(
    '/my-tasks/open-for-notifications',
    { userId, periodName: periodName?.trim() || undefined },
    accessToken,
  );
  return parseApiResponseOrFallback('my-tasks/open', myTasksOpenResponseSchema, raw, { tasks: [] });
}

/** @deprecated Use fetchMyTasksPage — returns first page only. */
export async function fetchMyTasks(
  userId: number,
  accessToken?: string | null,
  periodName?: string,
  skipCache = false,
): Promise<UserTask[]> {
  const data = await fetchMyTasksPage(
    userId,
    accessToken,
    periodName,
    { page: 1, pageSize: 100 },
    skipCache,
  );
  return data.tasks ?? [];
}

export async function completeWorkflowTaskViaBe(params: {
  userId: number;
  accessToken?: string | null;
  assetId: string;
  taskId: string;
  remark: string;
  roleId: number;
  completedAt?: string;
}): Promise<{ success: boolean; message: string }> {
  return postToCapexBe(
    '/task-actions/complete-workflow',
    {
      userId: params.userId,
      assetId: params.assetId,
      taskId: params.taskId,
      remark: params.remark,
      roleId: params.roleId,
      ...(params.completedAt ? { completedAt: params.completedAt } : {}),
    },
    params.accessToken,
  );
}

export async function completeAdhocTaskViaBe(params: {
  userId: number;
  accessToken?: string | null;
  adhocTaskId: string;
  remark: string;
}): Promise<{ success: boolean; message: string }> {
  return postToCapexBe(
    '/task-actions/complete-adhoc',
    {
      userId: params.userId,
      adhocTaskId: params.adhocTaskId,
      remark: params.remark,
    },
    params.accessToken,
  );
}

export async function revertTaskViaBe(params: {
  userId: number;
  accessToken?: string | null;
  assetId: string;
  taskId: string;
}): Promise<{ success: boolean; message: string }> {
  return postToCapexBe(
    '/task-actions/revert-to-open',
    { userId: params.userId, assetId: params.assetId, taskId: params.taskId },
    params.accessToken,
  );
}

export async function reportNotYetDoneViaBe(params: {
  userId: number;
  accessToken?: string | null;
  assetId: string;
  taskId: string;
}): Promise<{ success: boolean; message: string }> {
  return postToCapexBe(
    '/task-actions/report-not-yet-done',
    { userId: params.userId, assetId: params.assetId, taskId: params.taskId },
    params.accessToken,
  );
}

export async function withdrawReportViaBe(params: {
  userId: number;
  accessToken?: string | null;
  assetId: string;
  taskId: string;
}): Promise<{ success: boolean; message: string }> {
  return postToCapexBe(
    '/task-actions/withdraw-report',
    { userId: params.userId, assetId: params.assetId, taskId: params.taskId },
    params.accessToken,
  );
}

export async function updateTaskRemarkViaBe(params: {
  userId: number;
  accessToken?: string | null;
  assetId: string;
  taskId: string;
  remark: string;
}): Promise<{
  success: boolean;
  message: string;
  remark?: string;
  remarkEditHistory?: Array<{
    editedAt: string;
    editedByUserId?: number;
    editedByUsername?: string;
    previousRemark: string;
    newRemark: string;
  }>;
}> {
  return postToCapexBe(
    '/task-actions/update-remark',
    {
      userId: params.userId,
      assetId: params.assetId,
      taskId: params.taskId,
      remark: params.remark,
    },
    params.accessToken,
  );
}

export async function upsertFsApprovalViaBe(params: {
  userId: number;
  accessToken?: string | null;
  projectId: string;
  conclusion: string;
  amount?: number;
  followUpAction?: string | null;
  fsType?: string;
}): Promise<{ success: boolean; study?: Record<string, unknown>; fsStatus?: string }> {
  return postToCapexBe(
    '/task-actions/upsert-fs-approval',
    {
      userId: params.userId,
      projectId: params.projectId,
      conclusion: params.conclusion,
      amount: params.amount,
      followUpAction: params.followUpAction,
      fsType: params.fsType,
    },
    params.accessToken,
  );
}

/** Bearer for BE when BFF cannot rely on httpOnly cookies alone. */
export async function resolveMyTasksAccessToken(
  getAccessToken: () => Promise<string | null>,
): Promise<string | null> {
  if (useBeBffProxy() && useBackendSession()) return null;
  return getAccessToken();
}
