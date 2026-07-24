import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { CacheAsideService } from '../shared/cache-aside.service';
import {
  getUserById,
} from '../project-list/master-data.loader';
import {
  fetchAdhocTasksForUser,
  loadOpenPersonalTasksLightweight,
} from './my-tasks-open.loader';
import { loadMyTasksSnapshotFromStatuses } from './my-tasks-page.loader';
import { loadMyTasksMasterPayload } from './my-tasks-master.cache';
import { userCanViewAllTasks } from './task-assignment-scope';
import { paginateMyTasks, type MyTasksListQuery, type MyTasksPageResult } from './my-tasks-query';

type FullSnapshot = { tasks: any[] };

@Injectable()
export class MyTasksService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
    private readonly cacheAside: CacheAsideService,
  ) {}

  /** Align with FE TanStack staleTime — avoids cold reload on every poll. */
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private static readonly OPEN_COUNT_TTL_MS = 5 * 60 * 1000;

  private snapshotKey(userId: number, periodName?: string): string {
    return `my-tasks:v4:${userId}::${(periodName || '').trim().toLowerCase()}`;
  }

  private openCountKey(userId: number, periodName?: string): string {
    return `my-tasks:open-count:v1:${userId}::${(periodName || '').trim().toLowerCase()}`;
  }

  private openNotifyKey(userId: number, periodName?: string): string {
    return `my-tasks:open-notify:v1:${userId}::${(periodName || '').trim().toLowerCase()}`;
  }

  private openPollTasksKey(userId: number, periodName?: string): string {
    return `my-tasks:open-poll-tasks:v1:${userId}::${(periodName || '').trim().toLowerCase()}`;
  }

  /** Build (or reuse cache) full task snapshot for user + period. */
  async loadFullSnapshot(
    accessToken: string,
    userId: number,
    periodName?: string,
    skipCache = false,
  ): Promise<FullSnapshot> {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'My Task', 'view');
    const key = this.snapshotKey(userId, periodName);

    return this.cacheAside.getOrLoad(
      key,
      MyTasksService.CACHE_TTL_MS,
      () => this.buildFullSnapshot(accessToken, userId, periodName),
      { skipCache },
    );
  }

  private async buildFullSnapshot(
    accessToken: string,
    userId: number,
    periodName?: string,
  ): Promise<FullSnapshot> {
    const { client } = await this.authContext.getRlsClient(accessToken, userId);

    const [userRow, master] = await Promise.all([
      getUserById(client, userId),
      loadMyTasksMasterPayload(client),
    ]);

    if (!userRow) {
      throw new BadRequestException('User not found');
    }

    const userAssignments = userRow.assignments || [];
    const viewAllTasks = userCanViewAllTasks(userAssignments);
    const tasks = await loadMyTasksSnapshotFromStatuses(client, {
      userId,
      userAssignments,
      periodName,
      ...master,
      viewAllTasks,
    });

    return { tasks };
  }

  /** Paginated list — filters/sort applied server-side on cached snapshot. */
  async loadMyTasksPage(
    accessToken: string,
    userId: number,
    periodName: string | undefined,
    skipCache: boolean,
    query: MyTasksListQuery = {},
  ): Promise<MyTasksPageResult> {
    const snapshot = await this.loadFullSnapshot(accessToken, userId, periodName, skipCache);
    return paginateMyTasks(snapshot.tasks, query);
  }

  /** @deprecated Use loadMyTasksPage — kept for callers expecting full list. */
  async loadMyTasks(
    accessToken: string,
    userId: number,
    periodName?: string,
    skipCache = false,
    query?: MyTasksListQuery,
  ) {
    if (query && (query.page != null || query.pageSize != null || query.search != null)) {
      return this.loadMyTasksPage(accessToken, userId, periodName, skipCache, query);
    }
    return this.loadFullSnapshot(accessToken, userId, periodName, skipCache);
  }

  /** Lightweight poll — personal open tasks only for badge / notifications. */
  async loadOpenTaskCount(accessToken: string, userId: number, periodName?: string) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'My Task', 'view');
    const key = this.openCountKey(userId, periodName);

    return this.cacheAside.getOrLoad(key, MyTasksService.OPEN_COUNT_TTL_MS, async () => {
      const tasks = await this.resolveTasksForOpenPoll(accessToken, userId, periodName);
      const page = paginateMyTasks(tasks, {
        taskViewMode: 'my_tasks_only',
        showCompleted: false,
        page: 1,
        pageSize: 1,
      });
      const idsPage = paginateMyTasks(tasks, {
        taskViewMode: 'my_tasks_only',
        showCompleted: false,
        page: 1,
        pageSize: 200,
      });
      return {
        openCount: page.totalCount,
        taskIds: idsPage.tasks.map((t: { id: string }) => String(t.id)),
      };
    });
  }

  /** Open personal tasks for notification polling (slim payload, capped). */
  async loadOpenTasksForNotifications(
    accessToken: string,
    userId: number,
    periodName?: string,
  ): Promise<{ tasks: any[] }> {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'My Task', 'view');
    const key = this.openNotifyKey(userId, periodName);

    return this.cacheAside.getOrLoad(key, MyTasksService.OPEN_COUNT_TTL_MS, async () => {
      const tasks = await this.resolveTasksForOpenPoll(accessToken, userId, periodName);
      return {
        tasks: paginateMyTasks(tasks, {
          taskViewMode: 'my_tasks_only',
          showCompleted: false,
          page: 1,
          pageSize: 200,
          sortBy: 'targetDate_asc',
        }).tasks,
      };
    });
  }

  /** Poll path — never blocks on cold full snapshot rebuild. */
  private async resolveTasksForOpenPoll(
    accessToken: string,
    userId: number,
    periodName?: string,
  ): Promise<any[]> {
    const pollKey = this.openPollTasksKey(userId, periodName);
    return this.cacheAside.getOrLoad(
      pollKey,
      MyTasksService.OPEN_COUNT_TTL_MS,
      () => this.buildOpenPollTasksLightweight(accessToken, userId, periodName),
    );
  }

  private async buildOpenPollTasksLightweight(
    accessToken: string,
    userId: number,
    periodName?: string,
  ): Promise<any[]> {
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const [userRow, master] = await Promise.all([
      getUserById(client, userId),
      loadMyTasksMasterPayload(client),
    ]);
    if (!userRow) {
      throw new BadRequestException('User not found');
    }
    const userAssignments = userRow.assignments || [];
    const viewAllTasks = userCanViewAllTasks(userAssignments);
    const adhocForUser = await fetchAdhocTasksForUser(client, userId, viewAllTasks);
    return loadOpenPersonalTasksLightweight(client, {
      userId,
      userAssignments,
      periodName,
      ...master,
      adhocForUser,
    });
  }
}
