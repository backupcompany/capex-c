import type { SupabaseClient } from '@supabase/supabase-js';
import { FS_PROJECT_SELECT } from '../fs/fs-db.constants';
import {
  applyHuIdFilter,
  applyProjectSearchFilter,
  resolveFsAllowedHuIds,
} from '../fs/fs-hu-scope.util';
import type { FsUpdateQuery, FsUpdateSortOption } from './fs-update-query.dto';

export type FsUpdateProjectsPageResult = {
  projects: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
};

function clampPage(page: number): number {
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

function clampPageSize(pageSize: number): number {
  if (!Number.isFinite(pageSize)) return 20;
  return Math.min(200, Math.max(10, Math.floor(pageSize)));
}

function applyFsUpdateDbFilters<T extends { or: (expr: string) => T }>(
  query: T,
  queryParams: Pick<FsUpdateQuery, 'showOnlyNotFSApproved' | 'focusNeedingApproval'>,
): T {
  let q = query;
  if (queryParams.showOnlyNotFSApproved) {
    q = q.or('ax_code.is.null,ax_code.eq.,approved_budget.lte.0');
  }
  if (queryParams.focusNeedingApproval) {
    q = q.or('approved_budget.is.null,approved_budget.eq.0');
  }
  return q;
}

function applyFsUpdateSort<T extends { order: (col: string, opts: { ascending: boolean }) => T }>(
  query: T,
  sortBy: FsUpdateSortOption,
): T {
  switch (sortBy) {
    case 'projectCode_asc':
      return query.order('project_code', { ascending: true });
    case 'budgetPlan_desc':
      return query.order('budget_plan', { ascending: false });
    case 'projectName_asc':
    default:
      return query.order('project_name', { ascending: true });
  }
}

/** DB-level paginated projects for FS Update. */
export async function loadFsUpdateProjectsPage(
  client: SupabaseClient,
  query: FsUpdateQuery,
  masterHus: Array<{ id: string; name: string; archetypeId?: string; archetype_id?: string }>,
  masterArchetypes: Array<{ id: string; name: string }>,
): Promise<FsUpdateProjectsPageResult> {
  const pn = query.periodName.trim();
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const allowedHuIds = resolveFsAllowedHuIds(masterHus, masterArchetypes, {
    hus: query.hus,
    meetingArchetype: query.meetingArchetype,
    scopeFilter: query.scopeFilter,
  });

  if (allowedHuIds !== null && allowedHuIds.length === 0) {
    return { projects: [], total: 0, page, pageSize };
  }

  let q = client
    .from('projects')
    .select(FS_PROJECT_SELECT, { count: 'exact' })
    .eq('period_name', pn);

  const withHu = applyHuIdFilter(q, allowedHuIds);
  if (withHu === 'empty') {
    return { projects: [], total: 0, page, pageSize };
  }
  q = withHu;

  q = applyFsUpdateDbFilters(q, query);
  q = applyProjectSearchFilter(q, query.search);
  q = applyFsUpdateSort(q, query.sortBy);

  const { data, error, count } = await q.range(from, to);
  if (error) throw new Error(`projects(fs-update-page): ${error.message}`);

  return {
    projects: (data ?? []) as Record<string, unknown>[],
    total: typeof count === 'number' ? count : (data?.length ?? 0),
    page,
    pageSize,
  };
}
