import type { SupabaseClient } from '@supabase/supabase-js';
import {
  enrichAssetRowsFromJoinedSelect,
  extractProjectsFromJoinedRows,
} from '../project-list/enriched-assets.loader';
import {
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
  getAllProjectPriorities,
  getAllTasks,
} from '../project-list/master-data.loader';
import {
  loadAssetTypeGroupMasterMaps,
  poUpdateAssetListSelect,
} from '../project-list/project-list-query.util';
import { toCamelCase } from '../project-list/supabase-helpers';

const ASSET_PAGE_SIZE = 500;
const STATUS_PAGE_SIZE = 1000;
const LOG_PAGE_SIZE = 1000;

const MASTER_CACHE_TTL_MS = 5 * 60 * 1000;

type MasterPayload = {
  archetypes: any[];
  hus: any[];
  priorities: any[];
  allTasks: any[];
  assetTypeGroupMaps: Awaited<ReturnType<typeof loadAssetTypeGroupMasterMaps>>;
};

let masterCache: { expiresAt: number; payload: MasterPayload } | null = null;

async function loadMasterPayload(client: SupabaseClient): Promise<MasterPayload> {
  if (masterCache && masterCache.expiresAt > Date.now()) {
    return masterCache.payload;
  }
  const [archetypes, hus, priorities, allTasks, assetTypeGroupMaps] = await Promise.all([
    getAllArchetypesConfig(client),
    getAllHospitalUnitsConfig(client),
    getAllProjectPriorities(client),
    getAllTasks(client),
    loadAssetTypeGroupMasterMaps(client),
  ]);
  const payload: MasterPayload = { archetypes, hus, priorities, allTasks, assetTypeGroupMaps };
  masterCache = { expiresAt: Date.now() + MASTER_CACHE_TTL_MS, payload };
  return payload;
}

async function fetchJoinedAssetRowsForPeriod(
  client: SupabaseClient,
  periodName?: string,
): Promise<any[]> {
  const select = poUpdateAssetListSelect();
  const rows: any[] = [];
  let from = 0;
  const period = periodName?.trim() || '';

  while (true) {
    let query = client.from('assets').select(select).order('id', { ascending: true });
    if (period) {
      query = query.eq('projects.period_name', period);
    }
    const { data, error } = await query.range(from, from + ASSET_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`gr-update assets(period=${period || 'all'}): ${error.message}`);
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < ASSET_PAGE_SIZE) break;
    from += ASSET_PAGE_SIZE;
  }
  return rows;
}

async function fetchStatusesScoped(
  client: SupabaseClient,
  periodName?: string,
): Promise<any[]> {
  const period = periodName?.trim() || '';
  const select = period
    ? 'id, asset_id, task_id, status, start_date, target_end_date, completed_at, assets!inner(projects!inner(period_name))'
    : 'id, asset_id, task_id, status, start_date, target_end_date, completed_at';
  const rows: any[] = [];
  let from = 0;
  while (true) {
    let query = client.from('asset_task_statuses').select(select);
    if (period) query = query.eq('assets.projects.period_name', period);
    const { data, error } = await query.range(from, from + STATUS_PAGE_SIZE - 1);
    if (error) throw new Error(`gr-update statuses(period=${period || 'all'}): ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < STATUS_PAGE_SIZE) break;
    from += STATUS_PAGE_SIZE;
  }
  return rows;
}

async function fetchTaskLogsScoped(client: SupabaseClient, periodName?: string): Promise<any[]> {
  const period = periodName?.trim() || '';
  const select = period
    ? 'id, asset_id, task_id, completed_at, completed_by_user_id, assets!inner(projects!inner(period_name))'
    : 'id, asset_id, task_id, completed_at, completed_by_user_id';
  const rows: any[] = [];
  let from = 0;
  while (true) {
    let query = client.from('task_logs').select(select);
    if (period) query = query.eq('assets.projects.period_name', period);
    const { data, error } = await query.range(from, from + LOG_PAGE_SIZE - 1);
    if (error) throw new Error(`gr-update task_logs(period=${period || 'all'}): ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < LOG_PAGE_SIZE) break;
    from += LOG_PAGE_SIZE;
  }
  return rows;
}

export async function loadGrUpdatePageBundle(client: SupabaseClient, periodName?: string) {
  const period = periodName?.trim() || '';

  const master = await loadMasterPayload(client);
  const [joinedRows, statusesRaw, taskLogsRaw] = await Promise.all([
    fetchJoinedAssetRowsForPeriod(client, period || undefined),
    fetchStatusesScoped(client, period || undefined),
    fetchTaskLogsScoped(client, period || undefined),
  ]);

  const assets = enrichAssetRowsFromJoinedSelect(joinedRows, master.assetTypeGroupMaps);
  const projects = extractProjectsFromJoinedRows(joinedRows).map(toCamelCase);

  return {
    assets,
    archetypes: master.archetypes,
    hus: master.hus,
    projects,
    priorities: master.priorities,
    statuses: statusesRaw.map(toCamelCase),
    tasks: master.allTasks,
    taskLogs: taskLogsRaw.map(toCamelCase),
    totalAssetCount: assets.length,
  };
}
