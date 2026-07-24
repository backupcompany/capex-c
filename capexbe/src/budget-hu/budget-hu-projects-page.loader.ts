import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRecordsInBatches, toCamelCase } from '../project-list/supabase-helpers';
import { sanitizePostgrestSearchTerm } from '../shared/postgrest-filter.util';

const PROJECT_SELECT_HU =
  'id,hospital_unit_id,period_name,project_code,project_name,ax_code,budget_category_id,priority_id,type,status,budget_plan,budget_carry_forward,budget_allocated,approved_budget,consumed_budget,revenue_projection,target_start,end_date,budget_revenue_permonth,target_budget_start,is_routine_asset_aggregator,is_pipeline_project,completion_rate,task_to_do,owner,plan,asset_code,asset_name,stage';
const PCB_SELECT = 'project_id,budget_category_id,budget_plan';

export type HuStrategicProjectsPageQuery = {
  page: number;
  pageSize: number;
  search?: string;
};

export type HuStrategicProjectsPageResult = {
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
  return Math.min(200, Math.max(1, Math.floor(pageSize)));
}

function buildStrategicProjectsQuery(
  client: SupabaseClient,
  periodIdentifier: string,
  huId: string,
  search: string,
) {
  let q = client
    .from('projects')
    .select(PROJECT_SELECT_HU, { count: 'exact' })
    .eq('period_name', periodIdentifier)
    .eq('hospital_unit_id', huId)
    .eq('is_routine_asset_aggregator', false)
    .eq('is_pipeline_project', false)
    .order('project_code', { ascending: true });

  const term = sanitizePostgrestSearchTerm(search);
  if (term) {
    const pat = `%${term}%`;
    q = q.or(`project_code.ilike.${pat},project_name.ilike.${pat},ax_code.ilike.${pat}`);
  }
  return q;
}

function mapProjectRow(project: Record<string, unknown>, pcbByProjectId: Map<string, any[]>): Record<string, unknown> {
  const pid = String(project.id);
  const categoryBudgetPlan: Record<string, number> = {};
  pcbByProjectId.get(pid)?.forEach((pcb: any) => {
    categoryBudgetPlan[pcb.budget_category_id] = pcb.budget_plan;
  });

  const projectData: Record<string, unknown> = {
    ...toCamelCase(project),
    assets: [],
    categoryBudgetPlan: Object.keys(categoryBudgetPlan).length > 0 ? categoryBudgetPlan : undefined,
  };
  projectData.budgetAllocated =
    Number(project.budget_allocated ?? projectData.budgetAllocated) || 0;
  projectData.consumedBudget =
    Number(project.consumed_budget ?? projectData.consumedBudget) || 0;
  return projectData;
}

/** Paginated strategic projects for one HU — no assets (lazy-loaded on modal). */
export async function loadHuStrategicProjectsPage(
  client: SupabaseClient,
  periodName: string,
  hospitalUnitId: string,
  query: HuStrategicProjectsPageQuery,
): Promise<HuStrategicProjectsPageResult> {
  const pn = periodName.trim();
  const huId = hospitalUnitId.trim();
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  const search = String(query.search ?? '').trim();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const base = buildStrategicProjectsQuery(client, pn, huId, search);
  const { data, error, count } = await base.range(from, to);
  if (error) throw new Error(`projects(hu-page): ${error.message}`);

  const rows = (data ?? []) as Record<string, unknown>[];
  const projectIds = rows.map((r) => String(r.id));
  const pcbRows =
    projectIds.length > 0
      ? await fetchRecordsInBatches(client, 'project_category_budgets', 'project_id', projectIds, PCB_SELECT)
      : [];

  const pcbByProjectId = new Map<string, any[]>();
  for (const pcb of pcbRows || []) {
    const pid = String((pcb as { project_id: string }).project_id);
    const list = pcbByProjectId.get(pid);
    if (list) list.push(pcb);
    else pcbByProjectId.set(pid, [pcb]);
  }

  const projects = rows.map((row) => mapProjectRow(row, pcbByProjectId));
  const total = typeof count === 'number' ? count : projects.length;

  return { projects, total, page, pageSize };
}

/** Routine aggregator + pipeline rows only (Budget HU shell). */
export async function fetchHuShellProjects(
  client: SupabaseClient,
  periodIdentifier: string,
  hospitalUnitId: string,
  projectSelect: string,
): Promise<any[]> {
  const huId = hospitalUnitId.trim();
  if (!huId) return [];

  const { data, error } = await client
    .from('projects')
    .select(projectSelect)
    .eq('period_name', periodIdentifier)
    .eq('hospital_unit_id', huId)
    .or('is_routine_asset_aggregator.eq.true,is_pipeline_project.eq.true');
  if (error) throw new Error(`projects(hu-shell): ${error.message}`);
  return data ?? [];
}
