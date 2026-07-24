/**
 * Canonical PostgREST column names for FS-related tables.
 * Single source of truth — do not duplicate snake_case keys elsewhere.
 */

export const FS_ASSET_SELECT =
  'id,project_id,budget_category_id,asset_code,asset_name,budget_plan,consumed_budget,lifecycle_status';

/** Slim project row for FS Update screens — matches budget-period.loader PROJECT_SELECT_FS. */
export const FS_PROJECT_SELECT =
  'id,hospital_unit_id,period_name,project_code,project_name,ax_code,budget_category_id,budget_plan,budget_carry_forward,budget_allocated,approved_budget,consumed_budget,target_start,end_date,budget_revenue_permonth,target_budget_start,is_routine_asset_aggregator,is_pipeline_project';

/** feasibility_studies embed for FS Approval DB pagination. */
export const FS_APPROVAL_STUDY_PAGE_SELECT = `
  id,
  project_id,
  fs_type,
  amount,
  irr,
  payback_period,
  npv,
  roi,
  conclusion,
  follow_up_action,
  created_at,
  updated_at,
  projects!inner (
    period_name,
    project_name,
    budget_category_id,
    hospital_unit_id,
    hospital_units_config (
      name,
      archetype_id,
      archetypes_config ( name )
    )
  )
`;

/** feasibility_studies embed for FS Realization DB pagination. */
export const FS_REALIZATION_STUDY_PAGE_SELECT = `
  id,
  project_id,
  fs_type,
  amount,
  irr,
  payback_period,
  npv,
  roi,
  planned_revenue_start_date,
  actual_revenue_start_date,
  monthly_revenue_plan,
  conclusion,
  follow_up_action,
  created_at,
  updated_at,
  projects!inner (
    period_name,
    project_name,
    budget_category_id,
    hospital_unit_id,
    hospital_units_config (
      name,
      archetype_id,
      archetypes_config ( name )
    )
  )
`;

/** Subset for FS Update page bundle enrichment (summary + status). */
export const FS_STUDY_COLUMNS_BUNDLE =
  'id,project_id,fs_type,amount,conclusion,follow_up_action,updated_at';

/** Full FS study row for CRUD in fs.service. */
export const FS_STUDY_COLUMNS_FULL =
  'id,project_id,fs_type,amount,irr,payback_period,npv,roi,planned_revenue_start_date,actual_revenue_start_date,monthly_revenue_plan,throughput,conclusion,follow_up_action,created_at,updated_at';

export const FS_REALIZATION_COLUMNS =
  'id,fs_id,month,actual_revenue,actual_throughput,notes,created_at,updated_at';

/** Writable `projects` columns from FS Update / Smart Migration. */
export const FS_PROJECT_PATCH_DB = {
  axCode: 'ax_code',
  approvedBudget: 'approved_budget',
  targetBudgetStart: 'target_budget_start',
  budgetRevenuePermonth: 'budget_revenue_permonth',
} as const;

export type FsProjectPatchInput = {
  axCode?: string | null;
  approvedBudget?: number;
  targetBudgetStart?: string | null;
  budgetRevenuePermonth?: number;
};

/** Map camelCase patch → snake_case PostgREST update object (partial). */
export function buildFsProjectPatchUpdate(patch: FsProjectPatchInput): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  if (patch.axCode !== undefined) {
    const ax = patch.axCode == null ? '' : String(patch.axCode).trim();
    update[FS_PROJECT_PATCH_DB.axCode] = ax || null;
  }
  if (patch.approvedBudget !== undefined) {
    update[FS_PROJECT_PATCH_DB.approvedBudget] = Number(patch.approvedBudget) || 0;
  }
  if (patch.targetBudgetStart !== undefined) {
    update[FS_PROJECT_PATCH_DB.targetBudgetStart] =
      patch.targetBudgetStart == null || String(patch.targetBudgetStart).trim() === ''
        ? null
        : String(patch.targetBudgetStart).slice(0, 10);
  }
  if (patch.budgetRevenuePermonth !== undefined) {
    update[FS_PROJECT_PATCH_DB.budgetRevenuePermonth] = Number(patch.budgetRevenuePermonth) || 0;
  }

  return update;
}

/** feasibility_studies embed for FS Update meta summary (scoped aggregates). */
export const FS_UPDATE_META_STUDY_SELECT = `
  id,
  project_id,
  conclusion,
  amount,
  projects!inner (
    period_name,
    approved_budget,
    hospital_unit_id
  )
`;

/** All FS project patch DB column names (for static verification). */
export const FS_PROJECT_PATCH_DB_COLUMN_NAMES = Object.values(FS_PROJECT_PATCH_DB);
