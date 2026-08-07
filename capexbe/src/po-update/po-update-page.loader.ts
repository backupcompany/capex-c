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
  getAllWorkflowSets,
} from '../project-list/master-data.loader';
import {
  loadAssetTypeGroupMasterMaps,
  poUpdateAssetListSelect,
} from '../project-list/project-list-query.util';
import {
  buildPoFilterHash,
  filterPoAssets,
  isPoWindowUnfiltered,
  type PoUpdateWindowFilters,
} from './po-update-filter.util';
import { fetchAllRecordsWhereEq, normId, toCamelCase } from '../project-list/supabase-helpers';

export type PoUpdatePageBundleDto = {
  assets: any[];
  archetypes: any[];
  hus: any[];
  projects: any[];
  priorities: any[];
  assetHasPOMap: Record<string, boolean>;
  assetLastTaskMap: Record<string, string>;
  totalAssetCount: number;
};

const MASTER_CACHE_TTL_MS = 5 * 60 * 1000;
const ASSET_PAGE_SIZE = 500;
const STATUS_PAGE_SIZE = 1000;

const normalizeName = (value: unknown): string => String(value ?? '').trim().toLowerCase();

type MasterPayload = {
  archetypes: any[];
  hus: any[];
  priorities: any[];
  allTasks: any[];
  allWorkflows: any[];
  assetTypeGroupMaps: Awaited<ReturnType<typeof loadAssetTypeGroupMasterMaps>>;
};

let masterCache: { expiresAt: number; payload: MasterPayload } | null = null;

async function loadMasterPayload(client: SupabaseClient): Promise<MasterPayload> {
  if (masterCache && masterCache.expiresAt > Date.now()) {
    return masterCache.payload;
  }

  const [archetypes, hus, priorities, allTasks, allWorkflows, assetTypeGroupMaps] =
    await Promise.all([
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
      getAllProjectPriorities(client),
      getAllTasks(client),
      getAllWorkflowSets(client),
      loadAssetTypeGroupMasterMaps(client),
    ]);

  const payload: MasterPayload = {
    archetypes,
    hus,
    priorities,
    allTasks,
    allWorkflows,
    assetTypeGroupMaps,
  };
  masterCache = { expiresAt: Date.now() + MASTER_CACHE_TTL_MS, payload };
  return payload;
}

/** Satu query join per halaman — hindari `.in(project_id, …ribuan UUID)`. */
async function fetchJoinedAssetRowsForPeriod(
  client: SupabaseClient,
  periodName: string,
): Promise<any[]> {
  const select = poUpdateAssetListSelect();
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from('assets')
      .select(select)
      .eq('projects.period_name', periodName)
      .order('id', { ascending: true })
      .range(from, from + ASSET_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`assets(period=${periodName}): ${error.message}`);
    }
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < ASSET_PAGE_SIZE) break;
    from += ASSET_PAGE_SIZE;
  }

  return rows;
}

/** Done statuses for a page of asset ids (max ~100 — safe for `.in`). */
async function fetchDoneStatusesForAssetIds(
  client: SupabaseClient,
  assetIds: string[],
): Promise<any[]> {
  if (assetIds.length === 0) return [];
  const select = 'asset_id, task_id, status, completed_at';
  const { data, error } = await client
    .from('asset_task_statuses')
    .select(select)
    .eq('status', 'Done')
    .in('asset_id', assetIds);
  if (error) {
    throw new Error(`asset_task_statuses(assetIds): ${error.message}`);
  }
  return data ?? [];
}

/** Done statuses scoped by period via join — tanpa `.in(asset_id, …ribuan UUID)`. */
async function fetchDoneStatusesForPeriod(
  client: SupabaseClient,
  periodName: string,
): Promise<any[]> {
  const select =
    'asset_id, task_id, status, completed_at, assets!inner(projects!inner(period_name))';
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from('asset_task_statuses')
      .select(select)
      .eq('status', 'Done')
      .eq('assets.projects.period_name', periodName)
      .range(from, from + STATUS_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`asset_task_statuses(period=${periodName}): ${error.message}`);
    }
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < STATUS_PAGE_SIZE) break;
    from += STATUS_PAGE_SIZE;
  }

  return rows;
}

function buildPoPageMaps(
  assets: any[],
  allTasks: any[],
  allWorkflows: any[],
  poSentLogs: any[],
  doneStatuses: any[],
): { assetHasPOMap: Record<string, boolean>; assetLastTaskMap: Record<string, string> } {
  const poSentTask = allTasks.find(
    (t) => normalizeName(t.name) === 'po sent to vendor' || t.id === 'TASK-C-27',
  );
  const poSentAssetIds = new Set(
    poSentLogs.map((log) => normId(log.asset_id ?? log.assetId)).filter(Boolean),
  );

  const assetHasPOMap: Record<string, boolean> = {};
  for (const asset of assets) {
    const id = String(asset.id);
    assetHasPOMap[id] =
      poSentAssetIds.has(id) || Boolean(String(asset.poNumber ?? '').trim());
  }

  const workflowsMap = new Map(allWorkflows.map((w) => [String(w.id), w]));
  const tasksMap = new Map(allTasks.map((t) => [String(t.id), t]));
  const latestDoneByAsset = new Map<string, { taskId: string; at: number }>();

  for (const row of doneStatuses) {
    const assetId = normId(row.asset_id ?? row.assetId);
    const taskId = normId(row.task_id ?? row.taskId);
    if (!assetId || !taskId) continue;
    const at = new Date(String(row.completed_at ?? row.completedAt ?? 0)).getTime();
    if (!Number.isFinite(at)) continue;
    const prev = latestDoneByAsset.get(assetId);
    if (!prev || at > prev.at) {
      latestDoneByAsset.set(assetId, { taskId, at });
    }
  }

  const assetLastTaskMap: Record<string, string> = {};
  for (const asset of assets) {
    const latest = latestDoneByAsset.get(String(asset.id));
    if (!latest) continue;
    const workflow = workflowsMap.get(String(asset.workflowSetId ?? ''));
    if (!workflow?.steps?.length) continue;
    const step = workflow.steps.find((s: { taskId?: string }) => s.taskId === latest.taskId);
    if (!step) continue;
    const task = tasksMap.get(latest.taskId);
    if (task?.name) assetLastTaskMap[String(asset.id)] = String(task.name);
  }

  if (!poSentTask?.id) {
    for (const asset of assets) {
      const id = String(asset.id);
      if (!assetHasPOMap[id] && String(asset.poNumber ?? '').trim()) {
        assetHasPOMap[id] = true;
      }
    }
  }

  return { assetHasPOMap, assetLastTaskMap };
}

export async function loadPoUpdatePageBundle(
  client: SupabaseClient,
  periodName?: string,
): Promise<PoUpdatePageBundleDto> {
  const period = periodName?.trim() || '';
  if (!period) {
    return {
      assets: [],
      archetypes: [],
      hus: [],
      projects: [],
      priorities: [],
      assetHasPOMap: {},
      assetLastTaskMap: {},
      totalAssetCount: 0,
    };
  }

  const master = await loadMasterPayload(client);
  const { archetypes, hus, priorities, allTasks, allWorkflows, assetTypeGroupMaps } = master;

  const poSentTask = allTasks.find(
    (t) => normalizeName(t.name) === 'po sent to vendor' || t.id === 'TASK-C-27',
  );

  const [joinedRows, poSentLogs, doneStatuses] = await Promise.all([
    fetchJoinedAssetRowsForPeriod(client, period),
    poSentTask?.id
      ? fetchAllRecordsWhereEq(client, 'task_logs', 'task_id', String(poSentTask.id), 'asset_id')
      : Promise.resolve([]),
    fetchDoneStatusesForPeriod(client, period),
  ]);

  const assets = enrichAssetRowsFromJoinedSelect(joinedRows, assetTypeGroupMaps);
  const projects = extractProjectsFromJoinedRows(joinedRows).map(toCamelCase);

  const { assetHasPOMap, assetLastTaskMap } = buildPoPageMaps(
    assets,
    allTasks,
    allWorkflows,
    poSentLogs,
    doneStatuses,
  );

  return {
    assets,
    archetypes,
    hus,
    projects,
    priorities,
    assetHasPOMap,
    assetLastTaskMap,
    totalAssetCount: assets.length,
  };
}

export type PoUpdateMasterDto = {
  archetypes: any[];
  hus: any[];
  priorities: any[];
  finishedTaskOptions?: string[];
  assetTypeGroupOptions?: string[];
};

export type PoUpdateAssetWindowDto = {
  assets: any[];
  projects: any[];
  assetHasPOMap: Record<string, boolean>;
  assetLastTaskMap: Record<string, string>;
  totalAssetCount: number;
  page: number;
  pageSize: number;
};

/** Master config only — paint filter bar before asset window loads. */
export async function loadPoUpdateMaster(
  client: SupabaseClient,
  periodName?: string,
): Promise<PoUpdateMasterDto> {
  const master = await loadMasterPayload(client);
  const period = periodName?.trim() ?? '';
  if (!period) {
    return {
      archetypes: master.archetypes,
      hus: master.hus,
      priorities: master.priorities,
    };
  }

  const { allTasks, allWorkflows } = master;
  const poSentTask = allTasks.find(
    (t) => normalizeName(t.name) === 'po sent to vendor' || t.id === 'TASK-C-27',
  );
  const [joinedRows, poSentLogs, doneStatuses] = await Promise.all([
    fetchJoinedAssetRowsForPeriod(client, period),
    poSentTask?.id
      ? fetchAllRecordsWhereEq(client, 'task_logs', 'task_id', String(poSentTask.id), 'asset_id')
      : Promise.resolve([]),
    fetchDoneStatusesForPeriod(client, period),
  ]);
  const assets = enrichAssetRowsFromJoinedSelect(joinedRows, master.assetTypeGroupMaps);
  const { assetLastTaskMap } = buildPoPageMaps(
    assets,
    allTasks,
    allWorkflows,
    poSentLogs,
    doneStatuses,
  );

  const finishedTaskOptions = Array.from(new Set(Object.values(assetLastTaskMap))).sort((a, b) =>
    a.localeCompare(b),
  );
  const assetTypeGroupOptions = Array.from(
    new Set(assets.map((a) => String(a.assetTypeGroupName ?? '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  return {
    archetypes: master.archetypes,
    hus: master.hus,
    priorities: master.priorities,
    finishedTaskOptions,
    assetTypeGroupOptions,
  };
}

const FILTERED_IDS_CACHE_TTL_MS = 90_000;
const filteredIdsCache = new Map<string, { expiresAt: number; ids: string[] }>();

export function clearPoUpdateFilteredIdsCache(periodName?: string): void {
  const period = periodName?.trim().toLowerCase() ?? '';
  if (!period) {
    filteredIdsCache.clear();
    return;
  }
  for (const key of filteredIdsCache.keys()) {
    if (key.startsWith(`${period}:`)) filteredIdsCache.delete(key);
  }
}

async function loadFilteredAssetIdsForPeriod(
  client: SupabaseClient,
  period: string,
  filters: PoUpdateWindowFilters,
): Promise<string[]> {
  const cacheKey = `${period}:${buildPoFilterHash(filters)}`;
  const hit = filteredIdsCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.ids;

  const master = await loadMasterPayload(client);
  const { allTasks, allWorkflows, assetTypeGroupMaps, priorities } = master;
  const poSentTask = allTasks.find(
    (t) => normalizeName(t.name) === 'po sent to vendor' || t.id === 'TASK-C-27',
  );

  const [joinedRows, poSentLogs, doneStatuses] = await Promise.all([
    fetchJoinedAssetRowsForPeriod(client, period),
    poSentTask?.id
      ? fetchAllRecordsWhereEq(client, 'task_logs', 'task_id', String(poSentTask.id), 'asset_id')
      : Promise.resolve([]),
    fetchDoneStatusesForPeriod(client, period),
  ]);

  const assets = enrichAssetRowsFromJoinedSelect(joinedRows, assetTypeGroupMaps);
  const { assetHasPOMap, assetLastTaskMap } = buildPoPageMaps(
    assets,
    allTasks,
    allWorkflows,
    poSentLogs,
    doneStatuses,
  );
  const filtered = filterPoAssets(
    assets,
    filters,
    assetHasPOMap,
    assetLastTaskMap,
    priorities,
  );
  const ids = filtered.map((a) => String(a.id)).filter(Boolean);
  filteredIdsCache.set(cacheKey, { expiresAt: Date.now() + FILTERED_IDS_CACHE_TTL_MS, ids });
  return ids;
}

async function fetchJoinedAssetRowsByIds(
  client: SupabaseClient,
  period: string,
  assetIds: string[],
): Promise<any[]> {
  if (assetIds.length === 0) return [];
  const select = poUpdateAssetListSelect();
  const { data, error } = await client
    .from('assets')
    .select(select)
    .eq('projects.period_name', period)
    .in('id', assetIds);
  if (error) {
    throw new Error(`assets(byIds, period=${period}): ${error.message}`);
  }
  const rows = (data ?? []) as any[];
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  return assetIds.map((id) => byId.get(id)).filter(Boolean);
}

async function buildMapsForAssetIds(
  client: SupabaseClient,
  assets: any[],
  master: MasterPayload,
): Promise<{ assetHasPOMap: Record<string, boolean>; assetLastTaskMap: Record<string, string> }> {
  const { allTasks, allWorkflows } = master;
  const poSentTask = allTasks.find(
    (t) => normalizeName(t.name) === 'po sent to vendor' || t.id === 'TASK-C-27',
  );
  const assetIds = assets.map((a) => String(a.id)).filter(Boolean);
  const [poSentLogs, doneStatuses] = await Promise.all([
    poSentTask?.id && assetIds.length > 0
      ? fetchAllRecordsWhereEq(client, 'task_logs', 'task_id', String(poSentTask.id), 'asset_id')
      : Promise.resolve([]),
    assetIds.length > 0 ? fetchDoneStatusesForAssetIds(client, assetIds) : Promise.resolve([]),
  ]);
  const poSentLogsForPage = poSentLogs.filter((log) =>
    assetIds.includes(normId(log.asset_id ?? log.assetId)),
  );
  const doneForPage = doneStatuses.filter((row) =>
    assetIds.includes(normId(row.asset_id ?? row.assetId)),
  );
  return buildPoPageMaps(assets, allTasks, allWorkflows, poSentLogsForPage, doneForPage);
}

/** Paginated asset window — one viewport chunk per request. */
export async function loadPoUpdateAssetWindow(
  client: SupabaseClient,
  periodName: string,
  opts: { page: number; pageSize: number; filters?: PoUpdateWindowFilters },
): Promise<PoUpdateAssetWindowDto> {
  const period = periodName.trim();
  const page = Math.max(1, Math.floor(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Math.floor(opts.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const filters: PoUpdateWindowFilters = opts.filters ?? { poStatus: 'noPO' };

  const master = await loadMasterPayload(client);
  const { assetTypeGroupMaps } = master;

  if (isPoWindowUnfiltered(filters)) {
    const search = filters.search?.trim() ?? '';
    const select = poUpdateAssetListSelect();
    let query = client
      .from('assets')
      .select(select, { count: 'exact' })
      .eq('projects.period_name', period)
      .order('id', { ascending: true });

    if (search) {
      const term = `%${search.replace(/[%_]/g, '')}%`;
      query = query.or(
        `asset_name.ilike.${term},asset_code.ilike.${term},po_number.ilike.${term},cpr_id.ilike.${term}`,
      );
    }

    const { data, count, error } = await query.range(offset, offset + pageSize - 1);
    if (error) {
      throw new Error(`assets(window, period=${period}): ${error.message}`);
    }

    const joinedRows = data ?? [];
    const assets = enrichAssetRowsFromJoinedSelect(joinedRows, assetTypeGroupMaps);
    const projects = extractProjectsFromJoinedRows(joinedRows).map(toCamelCase);
    const { assetHasPOMap, assetLastTaskMap } = await buildMapsForAssetIds(client, assets, master);

    return {
      assets,
      projects,
      assetHasPOMap,
      assetLastTaskMap,
      totalAssetCount: typeof count === 'number' ? count : assets.length,
      page,
      pageSize,
    };
  }

  const filteredIds = await loadFilteredAssetIdsForPeriod(client, period, filters);
  const pageIds = filteredIds.slice(offset, offset + pageSize);
  const joinedRows = await fetchJoinedAssetRowsByIds(client, period, pageIds);
  const assets = enrichAssetRowsFromJoinedSelect(joinedRows, assetTypeGroupMaps);
  const projects = extractProjectsFromJoinedRows(joinedRows).map(toCamelCase);
  const { assetHasPOMap, assetLastTaskMap } = await buildMapsForAssetIds(client, assets, master);

  return {
    assets,
    projects,
    assetHasPOMap,
    assetLastTaskMap,
    totalAssetCount: filteredIds.length,
    page,
    pageSize,
  };
}
