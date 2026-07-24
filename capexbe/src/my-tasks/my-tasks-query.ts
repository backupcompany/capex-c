export type MyTasksTaskViewMode = 'all_users' | 'my_tasks_only';

export type MyTasksSortOption =
  | 'targetDate_desc'
  | 'targetDate_asc'
  | 'startDate_desc'
  | 'startDate_asc'
  | 'huName_asc';

export type MyTasksListQuery = {
  page?: number;
  pageSize?: number;
  taskViewMode?: MyTasksTaskViewMode;
  showCompleted?: boolean;
  search?: string;
  selectedArchetypes?: string[];
  selectedHUs?: string[];
  selectedAssignedRoles?: string[];
  sortBy?: MyTasksSortOption;
};

export type MyTasksFilterOptions = {
  archetypeNames: string[];
  huNames: string[];
  assignedRoleNames: string[];
};

export type MyTasksPageResult = {
  tasks: any[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filterOptions: MyTasksFilterOptions;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LEN = 200;

function isDoneStatus(status: unknown): boolean {
  return String(status ?? '').toLowerCase() === 'done';
}

function sanitizeSearch(raw: string | undefined): string {
  return String(raw ?? '')
    .trim()
    .slice(0, MAX_SEARCH_LEN)
    .toLowerCase();
}

function compareTasks(a: any, b: any, sortBy: MyTasksSortOption): number {
  switch (sortBy) {
    case 'targetDate_desc':
      return new Date(b.targetEndDate).getTime() - new Date(a.targetEndDate).getTime();
    case 'targetDate_asc':
      return new Date(a.targetEndDate).getTime() - new Date(b.targetEndDate).getTime();
    case 'startDate_desc':
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    case 'startDate_asc':
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    case 'huName_asc':
      return String(a.huName ?? '').localeCompare(String(b.huName ?? ''));
    default:
      return 0;
  }
}

export function buildMyTasksFilterOptions(tasks: any[]): MyTasksFilterOptions {
  const archetypes = new Set<string>();
  const hus = new Set<string>();
  const roles = new Set<string>();
  for (const t of tasks) {
    if (t.archetypeName) archetypes.add(String(t.archetypeName));
    if (t.huName) hus.add(String(t.huName));
    for (const r of t.assignedRoles ?? []) {
      if (r?.roleName) roles.add(String(r.roleName));
    }
  }
  const sortNames = (a: string, b: string) => a.localeCompare(b);
  return {
    archetypeNames: Array.from(archetypes).sort(sortNames),
    huNames: Array.from(hus).sort(sortNames),
    assignedRoleNames: Array.from(roles).sort(sortNames),
  };
}

function applyViewMode(tasks: any[], mode: MyTasksTaskViewMode): any[] {
  if (mode === 'all_users') return tasks;
  return tasks.filter((t) => t.isMine === true);
}

function filterAndSortTasks(allTasks: any[], query: MyTasksListQuery): any[] {
  const showCompleted = !!query.showCompleted;
  const searchLower = sanitizeSearch(query.search);
  const archetypeSet =
    query.selectedArchetypes?.length ? new Set(query.selectedArchetypes) : null;
  const huSet = query.selectedHUs?.length ? new Set(query.selectedHUs) : null;
  const roleSet =
    query.selectedAssignedRoles?.length ? new Set(query.selectedAssignedRoles) : null;
  const sortBy = query.sortBy ?? 'targetDate_desc';

  const filtered: any[] = [];
  for (const task of allTasks) {
    if (!showCompleted && isDoneStatus(task.status)) continue;

    if (searchLower) {
      const match =
        String(task.taskName ?? '').toLowerCase().includes(searchLower) ||
        String(task.projectName ?? '').toLowerCase().includes(searchLower) ||
        String(task.assetName ?? '').toLowerCase().includes(searchLower) ||
        String(task.huName ?? '').toLowerCase().includes(searchLower) ||
        String(task.projectCode ?? '').toLowerCase().includes(searchLower) ||
        String(task.description ?? '').toLowerCase().includes(searchLower);
      if (!match) continue;
    }

    if (archetypeSet && !archetypeSet.has(task.archetypeName)) continue;
    if (huSet && !huSet.has(task.huName)) continue;
    if (roleSet) {
      const names = (task.assignedRoles ?? [])
        .map((r: { roleName?: string }) => r.roleName)
        .filter(Boolean);
      if (!names.some((n: string) => roleSet.has(n))) continue;
    }

    filtered.push(task);
  }

  if (filtered.length <= 1) return filtered;
  return filtered.sort((a, b) => compareTasks(a, b, sortBy));
}

export function paginateMyTasks(allTasks: any[], query: MyTasksListQuery = {}): MyTasksPageResult {
  const taskViewMode = query.taskViewMode ?? 'all_users';
  const viewScoped = applyViewMode(allTasks, taskViewMode);
  const filtered = filterAndSortTasks(viewScoped, query);

  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE),
  );
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(query.page) || 1));
  const start = (page - 1) * pageSize;

  return {
    tasks: filtered.slice(start, start + pageSize),
    totalCount,
    page,
    pageSize,
    totalPages,
    filterOptions: buildMyTasksFilterOptions(viewScoped),
  };
}
