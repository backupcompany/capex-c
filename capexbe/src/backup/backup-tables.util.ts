/** Table metadata for full backup export/import (FK-safe order). */
export type BackupTableDef = {
  name: string;
  group: 'operational' | 'master';
  /** PostgREST upsert conflict columns; defaults to `id`. */
  onConflict?: string;
};

export const BACKUP_VERSION = 1;

/** Operational data — always restored on import. */
export const OPERATIONAL_BACKUP_TABLES: BackupTableDef[] = [
  { name: 'budget_multi_years', group: 'operational' },
  { name: 'budget_periods', group: 'operational', onConflict: 'period_name' },
  {
    name: 'budget_period_category_budgets',
    group: 'operational',
    onConflict: 'period_name,budget_category_id',
  },
  {
    name: 'budget_period_archetype_budgets',
    group: 'operational',
    onConflict: 'period_name,archetype_id,budget_category_id',
  },
  {
    name: 'budget_period_hospital_unit_budgets',
    group: 'operational',
    onConflict: 'period_name,hospital_unit_id,budget_category_id',
  },
  { name: 'projects', group: 'operational' },
  { name: 'assets', group: 'operational' },
  { name: 'asset_task_statuses', group: 'operational' },
  { name: 'task_logs', group: 'operational' },
  { name: 'feasibility_studies', group: 'operational' },
  { name: 'fs_realizations', group: 'operational' },
  { name: 'purchase_orders', group: 'operational' },
  { name: 'purchase_order_items', group: 'operational' },
  { name: 'moms', group: 'operational' },
  { name: 'adhoc_tasks', group: 'operational' },
];

/** Master/configuration — restored only when restoreMasterConfig=true. */
export const MASTER_BACKUP_TABLES: BackupTableDef[] = [
  { name: 'regionals_config', group: 'master' },
  { name: 'archetypes_config', group: 'master' },
  { name: 'hospital_units_config', group: 'master' },
  { name: 'budget_category_configs', group: 'master' },
  { name: 'project_priority_configs', group: 'master' },
  { name: 'asset_type_groups', group: 'master' },
  { name: 'asset_type_configs', group: 'master' },
  { name: 'asset_tags', group: 'master' },
  { name: 'tasks', group: 'master' },
  { name: 'workflow_sets', group: 'master' },
  { name: 'workflow_steps', group: 'master' },
  { name: 'workflow_step_roles', group: 'master', onConflict: 'workflow_step_id,role_id' },
  { name: 'workflow_step_triggers', group: 'master', onConflict: 'workflow_step_id,triggering_task_id' },
  { name: 'vendors', group: 'master' },
  { name: 'master_catalogue', group: 'master' },
  { name: 'rooms_config', group: 'master' },
  { name: 'roles', group: 'master' },
  { name: 'role_permissions', group: 'master', onConflict: 'role_id,hierarchy' },
  { name: 'users', group: 'master' },
  { name: 'user_assignments', group: 'master' },
  { name: 'user_assignment_scopes', group: 'master' },
  { name: 'app_config', group: 'master', onConflict: 'key' },
];

export const ALL_BACKUP_TABLES: BackupTableDef[] = [
  ...MASTER_BACKUP_TABLES,
  ...OPERATIONAL_BACKUP_TABLES,
];

export type BackupPayload = {
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
};

export function isBackupPayload(value: unknown): value is BackupPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.tables === 'object' && v.tables !== null && !Array.isArray(v.tables);
}
