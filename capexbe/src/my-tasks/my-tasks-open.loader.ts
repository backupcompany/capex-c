import type { SupabaseClient } from '@supabase/supabase-js';
import { TaskCurrentStatus } from '../project-list/progress-aggregate';
import { toCamelCase } from '../project-list/supabase-helpers';
import {
  buildScopeResolutionMaps,
  isBuiltTaskMineForUser,
  type UserAssignmentLike,
} from './task-assignment-scope';

const OPEN_STATUS_BATCH = 1000;

type OpenStatusRow = {
  id: string;
  asset_id?: string;
  task_id?: string;
  status?: string;
  start_date?: string;
  target_end_date?: string;
  assets?: {
    id: string;
    asset_code?: string;
    asset_name?: string;
    workflow_set_id?: string;
    projects?: {
      project_code?: string;
      project_name?: string;
      hospital_units_config?: {
        name?: string;
        archetypes_config?: { name?: string } | { name?: string }[] | null;
      } | null;
    };
  };
};

function huArchetypeFromJoined(asset: OpenStatusRow['assets']): { huName: string; archetypeName: string } {
  const hu = asset?.projects?.hospital_units_config;
  const archRaw = hu?.archetypes_config;
  const arch = Array.isArray(archRaw) ? archRaw[0] : archRaw;
  return {
    huName: String(hu?.name ?? ''),
    archetypeName: String(arch?.name ?? ''),
  };
}

async function fetchOpenStatusesForPeriod(
  client: SupabaseClient,
  periodName: string,
): Promise<OpenStatusRow[]> {
  const pn = periodName.trim();
  const rows: OpenStatusRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from('asset_task_statuses')
      .select(
        `
        id,
        asset_id,
        task_id,
        status,
        start_date,
        target_end_date,
        assets!inner (
          id,
          asset_code,
          asset_name,
          workflow_set_id,
          projects!inner (
            period_name,
            project_code,
            project_name,
            hospital_units_config (
              name,
              archetypes_config ( name )
            )
          )
        )
      `,
      )
      .eq('status', TaskCurrentStatus.Open)
      .eq('assets.projects.period_name', pn)
      .range(from, from + OPEN_STATUS_BATCH - 1);
    if (error) throw new Error(`my-tasks open statuses: ${error.message}`);
    const batch = (data ?? []) as unknown as OpenStatusRow[];
    rows.push(...batch);
    if (batch.length < OPEN_STATUS_BATCH) break;
    from += OPEN_STATUS_BATCH;
  }
  return rows;
}

/** Open personal tasks without scanning every asset in the period. */
export async function loadOpenPersonalTasksLightweight(
  client: SupabaseClient,
  params: {
    userId: number;
    userAssignments: UserAssignmentLike[];
    periodName?: string;
    allWorkflows: any[];
    allRoles: any[];
    allTasks: any[];
    archetypes: { id: string; name: string }[];
    hus: { id: string; name: string; archetypeId?: string; archetype_id?: string }[];
    adhocForUser: any[];
  },
): Promise<any[]> {
  const {
    userId,
    userAssignments,
    periodName,
    allWorkflows,
    allRoles,
    allTasks,
    archetypes,
    hus,
    adhocForUser,
  } = params;

  const scopeMaps = buildScopeResolutionMaps(
    archetypes,
    hus.map((hu) => ({
      id: hu.id,
      name: hu.name,
      archetypeId: String(hu.archetypeId ?? hu.archetype_id ?? ''),
    })),
  );
  const workflowMap = new Map(allWorkflows.map((w) => [String(w.id), w]));
  const taskMap = new Map(allTasks.map((t) => [String(t.id), t]));
  const tasks: any[] = [];

  for (const adhoc of adhocForUser) {
    if (String(adhoc.status ?? '').toLowerCase() === 'done') continue;
    if (Number(adhoc.assignedToUserId) !== Number(userId)) continue;
    tasks.push({
      type: 'adhoc',
      id: adhoc.id,
      taskName: 'Ad-hoc Task',
      status: adhoc.status,
      isMine: true,
      huName: '',
      archetypeName: '',
      targetEndDate: adhoc.dueDate,
      startDate: adhoc.createdAt,
    });
  }

  if (periodName?.trim()) {
    const openStatuses = await fetchOpenStatusesForPeriod(client, periodName.trim());
    for (const row of openStatuses) {
      const asset = row.assets;
      if (!asset?.workflow_set_id) continue;
      const workflow = workflowMap.get(String(asset.workflow_set_id));
      if (!workflow) continue;
      const taskId = String(row.task_id ?? '');
      const step = (workflow.steps ?? []).find(
        (s: { taskId?: string; task_id?: string }) => String(s.taskId ?? s.task_id) === taskId,
      );
      if (!step) continue;
      const taskDef = taskMap.get(taskId);
      const { huName, archetypeName } = huArchetypeFromJoined(asset);
      const isMine = isBuiltTaskMineForUser(userId, userAssignments, allRoles, scopeMaps, {
        type: 'workflow',
        workflowStep: step,
        huName,
        archetypeName,
      });
      if (!isMine) continue;
      tasks.push({
        type: 'workflow',
        id: row.id,
        taskName: taskDef?.name ?? 'Task',
        status: row.status ?? TaskCurrentStatus.Open,
        isMine: true,
        huName,
        archetypeName,
        assetId: asset.id,
        assetCode: asset.asset_code ?? '',
        assetName: asset.asset_name ?? '',
        projectCode: asset.projects?.project_code ?? '',
        projectName: asset.projects?.project_name ?? '',
        targetEndDate: row.target_end_date ?? row.start_date,
        startDate: row.start_date ?? new Date().toISOString(),
        workflowStep: step,
      });
    }
  }

  return tasks;
}

export async function fetchAdhocTasksForUser(
  client: SupabaseClient,
  userId: number,
  viewAllTasks: boolean,
): Promise<any[]> {
  if (viewAllTasks) {
    const { data, error } = await client.from('adhoc_tasks').select('*');
    if (error) throw new Error(`adhoc_tasks: ${error.message}`);
    return (data ?? []).map((row) => toCamelCase(row));
  }
  const { data, error } = await client
    .from('adhoc_tasks')
    .select('*')
    .eq('assigned_to_user_id', userId);
  if (error) throw new Error(`adhoc_tasks user: ${error.message}`);
  return (data ?? []).map((row) => toCamelCase(row));
}
