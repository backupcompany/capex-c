import type { SupabaseClient } from '@supabase/supabase-js';
import { TaskCurrentStatus } from '../project-list/progress-aggregate';
import { normAssetTaskStatusRow, normTaskLogRow, fetchRecordsByAssetIds } from '../project-list/supabase-helpers';
import { buildUserTasksSnapshot } from './build-user-tasks';
import { buildScopeResolutionMaps, type UserAssignmentLike } from './task-assignment-scope';
import { fetchAdhocTasksForUser } from './my-tasks-open.loader';

const STATUS_BATCH = 1000;

type StatusRow = {
  id: string;
  asset_id?: string;
  task_id?: string;
  status?: string;
  start_date?: string;
  target_end_date?: string;
  completed_at?: string;
  assets?: {
    id: string;
    asset_code?: string;
    asset_name?: string;
    workflow_set_id?: string;
    project_id?: string;
    projects?: {
      id?: string;
      project_code?: string;
      project_name?: string;
      hospital_units_config?: {
        name?: string;
        archetypes_config?: { name?: string } | { name?: string }[] | null;
      } | null;
    };
  };
};

function huArchetypeFromJoined(asset: StatusRow['assets']): { huName: string; archetypeName: string } {
  const hu = asset?.projects?.hospital_units_config;
  const archRaw = hu?.archetypes_config;
  const arch = Array.isArray(archRaw) ? archRaw[0] : archRaw;
  return {
    huName: String(hu?.name ?? ''),
    archetypeName: String(arch?.name ?? ''),
  };
}

function minimalAssetFromStatusRow(row: StatusRow): Record<string, unknown> | null {
  const asset = row.assets;
  if (!asset?.id) return null;
  const { huName, archetypeName } = huArchetypeFromJoined(asset);
  return {
    id: asset.id,
    assetCode: asset.asset_code ?? '',
    assetName: asset.asset_name ?? '',
    workflowSetId: asset.workflow_set_id ?? '',
    projectId: asset.projects?.id ?? asset.project_id ?? '',
    projectCode: asset.projects?.project_code ?? '',
    projectName: asset.projects?.project_name ?? '',
    huName,
    archetypeName,
  };
}

/** Workflow statuses for period — Open always; Done when building full task list. */
async function fetchWorkflowStatusesForPeriod(
  client: SupabaseClient,
  periodName: string,
  includeDone: boolean,
): Promise<StatusRow[]> {
  const pn = periodName.trim();
  const rows: StatusRow[] = [];
  let from = 0;

  while (true) {
    let query = client
      .from('asset_task_statuses')
      .select(
        `
        id,
        asset_id,
        task_id,
        status,
        start_date,
        target_end_date,
        completed_at,
        assets!inner (
          id,
          asset_code,
          asset_name,
          workflow_set_id,
          project_id,
          projects!inner (
            id,
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
      .eq('assets.projects.period_name', pn);

    if (!includeDone) {
      query = query.eq('status', TaskCurrentStatus.Open);
    } else {
      query = query.in('status', [TaskCurrentStatus.Open, 'Done']);
    }

    const { data, error } = await query.range(from, from + STATUS_BATCH - 1);
    if (error) throw new Error(`my-tasks statuses(period=${pn}): ${error.message}`);
    const batch = (data ?? []) as unknown as StatusRow[];
    rows.push(...batch);
    if (batch.length < STATUS_BATCH) break;
    from += STATUS_BATCH;
  }

  return rows;
}

async function fetchMinimalAssetsByIds(
  client: SupabaseClient,
  assetIds: string[],
): Promise<Record<string, unknown>[]> {
  if (!assetIds.length) return [];
  const out: Record<string, unknown>[] = [];
  const chunkSize = 150;
  for (let i = 0; i < assetIds.length; i += chunkSize) {
    const chunk = assetIds.slice(i, i + chunkSize);
    const { data, error } = await client
      .from('assets')
      .select(
        `
        id,
        asset_code,
        asset_name,
        workflow_set_id,
        project_id,
        projects (
          id,
          project_code,
          project_name,
          hospital_units_config (
            name,
            archetypes_config ( name )
          )
        )
      `,
      )
      .in('id', chunk);
    if (error) throw new Error(`my-tasks assets by id: ${error.message}`);
    for (const row of (data ?? []) as NonNullable<StatusRow['assets']>[]) {
      if (!row?.id) continue;
      const fakeStatusRow: StatusRow = { id: '', assets: row };
      const minimal = minimalAssetFromStatusRow(fakeStatusRow);
      if (minimal) out.push(minimal);
    }
  }
  return out;
}

/**
 * Build full My Tasks snapshot from status rows + scoped logs — no getAllEnrichedAssetsForPeriod.
 */
export async function loadMyTasksSnapshotFromStatuses(
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
    viewAllTasks: boolean;
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
    viewAllTasks,
  } = params;

  const scopeMaps = buildScopeResolutionMaps(
    archetypes,
    hus.map((hu) => ({
      id: hu.id,
      name: hu.name,
      archetypeId: String(hu.archetypeId ?? hu.archetype_id ?? ''),
    })),
  );

  const adhocForUser = await fetchAdhocTasksForUser(client, userId, viewAllTasks);
  const assetMap = new Map<string, Record<string, unknown>>();
  let allAssetStatuses: any[] = [];

  if (periodName?.trim()) {
    const statusRows = await fetchWorkflowStatusesForPeriod(client, periodName.trim(), true);
    for (const row of statusRows) {
      const minimal = minimalAssetFromStatusRow(row);
      if (minimal?.id) assetMap.set(String(minimal.id), minimal);
      allAssetStatuses.push(normAssetTaskStatusRow(row));
    }
  }

  const adhocAssetIds = [
    ...new Set(
      adhocForUser
        .map((a) => String(a.assetId ?? ''))
        .filter((id) => id && !assetMap.has(id)),
    ),
  ];
  if (adhocAssetIds.length) {
    for (const asset of await fetchMinimalAssetsByIds(client, adhocAssetIds)) {
      if (asset.id) assetMap.set(String(asset.id), asset);
    }
  }

  const assetIds = [...assetMap.keys()];
  const logsRaw = assetIds.length
    ? await fetchRecordsByAssetIds(client, 'task_logs', assetIds)
    : [];
  const allTaskLogs = (logsRaw || []).map(normTaskLogRow);

  const snapshot = buildUserTasksSnapshot({
    userId,
    userAssignments,
    scopeMaps,
    allAssets: [...assetMap.values()],
    allRoles,
    allWorkflows,
    allTasks,
    allAssetStatuses,
    allTaskLogs,
    adhocForUser,
  });

  return snapshot;
}
