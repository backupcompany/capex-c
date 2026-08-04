import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRecordsWhereEq } from '../project-list/supabase-helpers';
import type { ExecutiveSummaryListFilters } from './executive-summary.dto';

const CATEGORY_BUDGET_SELECT =
  'budget_category_id, budget_plan, budget_carry_forward, budget_allocated, approved_budget, consumed_budget';

export type ExecutiveDashboardKpiSummary = {
  totalBudget: number;
  budgetAllocationToProject: number;
  budgetApproval: number;
  budgetConsumed: number;
  budgetRevenuePerMonth: number;
  utilizationPct: number;
};

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function sumCategoryFields(rows: Array<Record<string, unknown>>) {
  let totalBudget = 0;
  let budgetAllocated = 0;
  let budgetApproved = 0;
  let budgetConsumed = 0;
  for (const cb of rows) {
    totalBudget += num(cb.budget_plan) + num(cb.budget_carry_forward);
    budgetAllocated += num(cb.budget_allocated);
    budgetApproved += num(cb.approved_budget);
    budgetConsumed += num(cb.consumed_budget);
  }
  return { totalBudget, budgetAllocated, budgetApproved, budgetConsumed };
}

async function sumProjectRevenue(
  client: SupabaseClient,
  periodName: string,
  archetypeId?: string,
): Promise<number> {
  let total = 0;
  let from = 0;
  const batch = 1000;
  while (true) {
    let q = client
      .from('projects')
      .select('budget_revenue_permonth, hospital_units_config!inner ( archetype_id )')
      .eq('period_name', periodName.trim());
    if (archetypeId) {
      q = q.eq('hospital_units_config.archetype_id', archetypeId);
    }
    const { data, error } = await q.range(from, from + batch - 1);
    if (error) throw new Error(`kpi revenue: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      total += num((row as { budget_revenue_permonth?: number }).budget_revenue_permonth);
    }
    if (data.length < batch) break;
    from += batch;
  }
  return total;
}

/** Fallback when RPC not deployed — category budget rows + lightweight revenue scan. */
async function loadKpiFallback(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
): Promise<ExecutiveDashboardKpiSummary> {
  const pn = periodName.trim();
  const archetypeId = filters.archetypeId?.trim() || undefined;

  if (archetypeId) {
    let totalBudget = 0;
    let budgetAllocated = 0;
    let budgetApproved = 0;
    let budgetConsumed = 0;
    let from = 0;
    const batch = 500;
    while (true) {
      const { data, error } = await client
        .from('projects')
        .select(
          `budget_plan, budget_carry_forward, budget_allocated, approved_budget, consumed_budget,
           hospital_units_config!inner ( archetype_id )`,
        )
        .eq('period_name', pn)
        .eq('hospital_units_config.archetype_id', archetypeId)
        .range(from, from + batch - 1);
      if (error) throw new Error(`kpi scoped: ${error.message}`);
      if (!data?.length) break;
      for (const row of data) {
        const r = row as Record<string, unknown>;
        totalBudget += num(r.budget_plan) + num(r.budget_carry_forward);
        budgetAllocated += num(r.budget_allocated);
        budgetApproved += num(r.approved_budget);
        budgetConsumed += num(r.consumed_budget);
      }
      if (data.length < batch) break;
      from += batch;
    }
    const budgetRevenuePerMonth = await sumProjectRevenue(client, pn, archetypeId);
    const utilizationPct =
      totalBudget > 0 ? Math.round((budgetConsumed / totalBudget) * 1000) / 10 : 0;
    return {
      totalBudget,
      budgetAllocationToProject: budgetAllocated,
      budgetApproval: budgetApproved,
      budgetConsumed,
      budgetRevenuePerMonth,
      utilizationPct,
    };
  }

  const categoryRows = await fetchAllRecordsWhereEq(
    client,
    'budget_period_category_budgets',
    'period_name',
    pn,
    CATEGORY_BUDGET_SELECT,
  ).catch(() => [] as unknown[]);

  const totals = sumCategoryFields((categoryRows ?? []) as Array<Record<string, unknown>>);
  const budgetRevenuePerMonth = await sumProjectRevenue(client, pn);
  const utilizationPct =
    totals.totalBudget > 0 ? Math.round((totals.budgetConsumed / totals.totalBudget) * 1000) / 10 : 0;

  return {
    totalBudget: totals.totalBudget,
    budgetAllocationToProject: totals.budgetAllocated,
    budgetApproval: totals.budgetApproved,
    budgetConsumed: totals.budgetConsumed,
    budgetRevenuePerMonth,
    utilizationPct,
  };
}

/** SQL aggregate KPI — one RPC when migration applied, else lightweight fallback. */
export async function loadExecutiveDashboardKpi(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
): Promise<ExecutiveDashboardKpiSummary> {
  const pn = periodName.trim();
  const archetypeId = filters.archetypeId?.trim() || null;

  const { data, error } = await client.rpc('executive_dashboard_kpi', {
    p_period_name: pn,
    p_archetype_id: archetypeId,
  });

  if (error || !data) {
    return loadKpiFallback(client, pn, filters);
  }

  const row = data as Record<string, unknown>;
  return {
    totalBudget: num(row.totalBudget),
    budgetAllocationToProject: num(row.budgetAllocationToProject),
    budgetApproval: num(row.budgetApproval),
    budgetConsumed: num(row.budgetConsumed),
    budgetRevenuePerMonth: num(row.budgetRevenuePerMonth),
    utilizationPct: num(row.utilizationPct),
  };
}
