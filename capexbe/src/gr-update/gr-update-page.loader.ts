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
  grUpdateAssetListSelect,
  loadAssetTypeGroupMasterMaps,
} from '../project-list/project-list-query.util';
import { fetchAllRecordsWhereEq, normId, toCamelCase } from '../project-list/supabase-helpers';
import {
  buildGrFilterHash,
  filterGrAssets,
  isGrWindowUnfiltered,
  type GrUpdateWindowFilters,
} from './gr-update-filter.util';

const ASSET_PAGE_SIZE = 500;
const STATUS_PAGE_SIZE = 1000;
const MASTER_CACHE_TTL_MS = 5 * 60 * 1000;
const FILTERED_IDS_CACHE_TTL_MS = 90_000;

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
const filteredIdsCache = new Map<string, { expiresAt: number; ids: string[] }>();
const ELIGIBLE_CACHE_TTL_MS = 90_000;
type EligiblePayload = Awaited<ReturnType<typeof loadGrEligibleAssets>>;
const eligibleCache = new Map<string, { expiresAt: number; payload: EligiblePayload }>();
const eligibleInflight = new Map<string, Promise<EligiblePayload>>();

export function clearGrUpdateFilteredIdsCache(periodName?: string): void {
  const period = periodName?.trim().toLowerCase() ?? '';
  if (!period) {
    filteredIdsCache.clear();
    eligibleCache.clear();
    eligibleInflight.clear();
    return;
  }
  for (const key of filteredIdsCache.keys()) {
    if (key.startsWith(`${period}:`)) filteredIdsCache.delete(key);
  }
  eligibleCache.delete(period);
  eligibleInflight.delete(period);
}

function getTaskTriggerEvents(task: any): string[] {
  const fromArray = (task?.triggerEvents ?? []).filter(Boolean);
  if (fromArray.length > 0) {
    return [...new Set<string>(fromArray.map((v: unknown) => String(v)))];
  }
  if (task?.triggerEvent) return [String(task.triggerEvent)];
  return [];
}

function taskHasTriggerEvent(task: any, event: string): boolean {
  return Boolean(task?.isSystemTriggered) && getTaskTriggerEvents(task).includes(event);
}

function isGrnTask(task: any): boolean {
  if (taskHasTriggerEvent(task, 'PO_GOODS_RECEIVED')) return true;
  const name = normalizeName(task?.name);
  return name.includes('grn') || name.includes('goods received') || name.includes('good received');
}

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

/** Only assets that might need GR — not the full period asset list. */
async function fetchGrCandidateRows(client: SupabaseClient, period: string): Promise<any[]> {
  const select = grUpdateAssetListSelect();
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from('assets')
      .select(select)
      .eq('projects.period_name', period)
      .or('consumed_budget.gt.0,is_goods_received.eq.true,received_qty.gt.0,po_number.not.is.null')
      .order('id', { ascending: true })
      .range(from, from + ASSET_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`gr-update candidates(period=${period}): ${error.message}`);
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < ASSET_PAGE_SIZE) break;
    from += ASSET_PAGE_SIZE;
  }

  return rows;
}

async function fetchGrnCompletedAssetIds(
  client: SupabaseClient,
  period: string,
  grnTaskIds: string[],
): Promise<Set<string>> {
  const completed = new Set<string>();
  if (grnTaskIds.length === 0) return completed;

  const select = 'asset_id, task_id, assets!inner(projects!inner(period_name))';
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from('asset_task_statuses')
      .select(select)
      .eq('status', 'Done')
      .in('task_id', grnTaskIds)
      .eq('assets.projects.period_name', period)
      .range(from, from + STATUS_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`gr-update grn statuses(period=${period}): ${error.message}`);
    }
    if (!data?.length) break;

    for (const row of data as any[]) {
      const assetId = normId(row.asset_id ?? row.assetId);
      if (assetId) completed.add(assetId);
    }
    if (data.length < STATUS_PAGE_SIZE) break;
    from += STATUS_PAGE_SIZE;
  }

  for (const taskId of grnTaskIds) {
    const logs = await fetchAllRecordsWhereEq(client, 'task_logs', 'task_id', taskId, 'asset_id');
    for (const log of logs) {
      const assetId = normId(log.asset_id ?? log.assetId);
      if (assetId) completed.add(assetId);
    }
  }

  return completed;
}

function isGrCandidate(asset: any): boolean {
  const receivedQty = Number(asset.receivedQty ?? asset.received_qty ?? 0) || 0;
  const isReceived = Boolean(asset.isGoodsReceived ?? asset.is_goods_received) || receivedQty > 0;
  const hasPO = Boolean(String(asset.poNumber ?? asset.po_number ?? '').trim());
  const hasConsumedBudget = Number(asset.consumedBudget ?? asset.consumed_budget ?? 0) > 0;
  return hasPO || isReceived || hasConsumedBudget;
}

function buildGrLastTaskMap(
  assets: any[],
  allTasks: any[],
  allWorkflows: any[],
  doneStatuses: any[],
): Record<string, string> {
  const tasksMap = new Map(allTasks.map((t) => [String(t.id), t]));
  const workflowsMap = new Map(allWorkflows.map((w) => [String(w.id), w]));
  const assetIds = new Set(assets.map((a) => String(a.id)));
  const latestDoneByAsset = new Map<string, { taskId: string; at: number }>();

  for (const row of doneStatuses) {
    const assetId = normId(row.asset_id ?? row.assetId);
    const taskId = normId(row.task_id ?? row.taskId);
    if (!assetId || !taskId || !assetIds.has(assetId)) continue;
    const at = new Date(String(row.completed_at ?? row.completedAt ?? 0)).getTime();
    if (!Number.isFinite(at)) continue;
    const prev = latestDoneByAsset.get(assetId);
    if (!prev || at > prev.at) latestDoneByAsset.set(assetId, { taskId, at });
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
  return assetLastTaskMap;
}

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
      throw new Error(`gr-update done statuses(period=${periodName}): ${error.message}`);
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < STATUS_PAGE_SIZE) break;
    from += STATUS_PAGE_SIZE;
  }
  return rows;
}

async function fetchDoneStatusesForAssetIds(
  client: SupabaseClient,
  assetIds: string[],
): Promise<any[]> {
  if (assetIds.length === 0) return [];
  const { data, error } = await client
    .from('asset_task_statuses')
    .select('asset_id, task_id, status, completed_at')
    .eq('status', 'Done')
    .in('asset_id', assetIds);
  if (error) {
    throw new Error(`gr-update done statuses(assetIds): ${error.message}`);
  }
  return data ?? [];
}

async function loadGrEligibleAssets(client: SupabaseClient, period: string) {
  const master = await loadMasterPayload(client);
  const grnTasks = master.allTasks.filter(isGrnTask);
  const grnTaskIds = grnTasks.map((t) => String(t.id)).filter(Boolean);

  const candidateRows = await fetchGrCandidateRows(client, period);
  if (candidateRows.length === 0) {
    return {
      master,
      assetsNeedingGrn: [],
      assetLastTaskMap: {},
      projects: [],
      grnTasks,
    };
  }

  const [grnCompletedIds, doneStatuses] = await Promise.all([
    fetchGrnCompletedAssetIds(client, period, grnTaskIds),
    fetchDoneStatusesForPeriod(client, period),
  ]);

  const enriched = enrichAssetRowsFromJoinedSelect(candidateRows, master.assetTypeGroupMaps)
    .filter(isGrCandidate)
    .map((asset) => ({
      ...asset,
      receivedQty: Number(asset.receivedQty ?? 0) || 0,
      qty: Number(asset.qty ?? 1) || 1,
    }));

  const assetsNeedingGrn =
    grnTaskIds.length === 0
      ? enriched
      : enriched.filter((asset) => !grnCompletedIds.has(String(asset.id)));

  const assetLastTaskMap = buildGrLastTaskMap(
    assetsNeedingGrn,
    master.allTasks,
    master.allWorkflows,
    doneStatuses,
  );

  return {
    master,
    assetsNeedingGrn,
    assetLastTaskMap,
    projects: extractProjectsFromJoinedRows(candidateRows).map(toCamelCase),
    grnTasks,
  };
}

async function getGrEligibleCached(client: SupabaseClient, period: string): Promise<EligiblePayload> {
  const key = period.trim().toLowerCase();
  const hit = eligibleCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.payload;

  let inflight = eligibleInflight.get(key);
  if (!inflight) {
    inflight = loadGrEligibleAssets(client, period).then((payload) => {
      eligibleCache.set(key, { expiresAt: Date.now() + ELIGIBLE_CACHE_TTL_MS, payload });
      eligibleInflight.delete(key);
      return payload;
    });
    eligibleInflight.set(key, inflight);
  }
  return inflight;
}

function buildGrFilterOptionsFromEligible(payload: EligiblePayload) {
  const finishedTaskOptions = Array.from(new Set(Object.values(payload.assetLastTaskMap))).sort(
    (a, b) => a.localeCompare(b),
  );
  const assetTypeGroupOptions = Array.from(
    new Set(
      payload.assetsNeedingGrn.map((a) => String(a.assetTypeGroupName ?? '').trim()).filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
  return { finishedTaskOptions, assetTypeGroupOptions };
}

export type GrUpdateMasterDto = {
  archetypes: any[];
  hus: any[];
  priorities: any[];
  grnTasks: any[];
  finishedTaskOptions: string[];
  assetTypeGroupOptions: string[];
};

export type GrUpdateAssetWindowDto = {
  assets: any[];
  projects: any[];
  assetLastTaskMap: Record<string, string>;
  totalAssetCount: number;
  page: number;
  pageSize: number;
};

export async function loadGrUpdateMaster(
  client: SupabaseClient,
  periodName?: string,
): Promise<GrUpdateMasterDto> {
  const period = periodName?.trim() ?? '';
  const master = await loadMasterPayload(client);
  const grnTasks = master.allTasks.filter(isGrnTask).map(toCamelCase);

  if (!period) {
    return {
      archetypes: master.archetypes,
      hus: master.hus,
      priorities: master.priorities,
      grnTasks,
      finishedTaskOptions: [],
      assetTypeGroupOptions: [],
    };
  }

  const eligible = await getGrEligibleCached(client, period);
  const filterOptions = buildGrFilterOptionsFromEligible(eligible);

  return {
    archetypes: master.archetypes,
    hus: master.hus,
    priorities: master.priorities,
    grnTasks,
    ...filterOptions,
  };
}

async function loadFilteredGrAssetIds(
  client: SupabaseClient,
  period: string,
  filters: GrUpdateWindowFilters,
): Promise<string[]> {
  const cacheKey = `${period}:${buildGrFilterHash(filters)}`;
  const hit = filteredIdsCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.ids;

  const { assetsNeedingGrn, assetLastTaskMap, master } = await getGrEligibleCached(client, period);
  const filtered = filterGrAssets(
    assetsNeedingGrn,
    filters,
    assetLastTaskMap,
    master.priorities,
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
  const select = grUpdateAssetListSelect();
  const { data, error } = await client
    .from('assets')
    .select(select)
    .eq('projects.period_name', period)
    .in('id', assetIds);
  if (error) {
    throw new Error(`gr-update assets(byIds, period=${period}): ${error.message}`);
  }
  const rows = (data ?? []) as any[];
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  return assetIds.map((id) => byId.get(id)).filter(Boolean);
}

export async function loadGrUpdateAssetWindow(
  client: SupabaseClient,
  periodName: string,
  opts: { page: number; pageSize: number; filters?: GrUpdateWindowFilters },
): Promise<GrUpdateAssetWindowDto> {
  const period = periodName.trim();
  const page = Math.max(1, Math.floor(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Math.floor(opts.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const filters: GrUpdateWindowFilters = opts.filters ?? { grStatus: 'all' };

  const master = await loadMasterPayload(client);

  if (isGrWindowUnfiltered(filters)) {
    const { assetsNeedingGrn, assetLastTaskMap } = await getGrEligibleCached(client, period);
    const pageAssets = assetsNeedingGrn.slice(offset, offset + pageSize);
    return {
      assets: pageAssets,
      projects: extractProjectsFromJoinedRows(await fetchJoinedAssetRowsByIds(
        client,
        period,
        pageAssets.map((a) => String(a.id)),
      )).map(toCamelCase),
      assetLastTaskMap: Object.fromEntries(
        pageAssets
          .map((a) => [String(a.id), assetLastTaskMap[String(a.id)]])
          .filter(([, name]) => Boolean(name)),
      ),
      totalAssetCount: assetsNeedingGrn.length,
      page,
      pageSize,
    };
  }

  const filteredIds = await loadFilteredGrAssetIds(client, period, filters);
  const pageIds = filteredIds.slice(offset, offset + pageSize);
  const joinedRows = await fetchJoinedAssetRowsByIds(client, period, pageIds);
  const assets = enrichAssetRowsFromJoinedSelect(joinedRows, master.assetTypeGroupMaps).map(
    (asset) => ({
      ...asset,
      receivedQty: Number(asset.receivedQty ?? 0) || 0,
      qty: Number(asset.qty ?? 1) || 1,
    }),
  );
  const doneStatuses = await fetchDoneStatusesForAssetIds(
    client,
    assets.map((a) => String(a.id)),
  );
  const assetLastTaskMap = buildGrLastTaskMap(
    assets,
    master.allTasks,
    master.allWorkflows,
    doneStatuses,
  );

  return {
    assets,
    projects: extractProjectsFromJoinedRows(joinedRows).map(toCamelCase),
    assetLastTaskMap,
    totalAssetCount: filteredIds.length,
    page,
    pageSize,
  };
}

/** Legacy full bundle — pre-filtered eligible assets only, no bulk task_logs. */
export async function loadGrUpdatePageBundle(client: SupabaseClient, periodName?: string) {
  const period = periodName?.trim() || '';
  if (!period) {
    const master = await loadMasterPayload(client);
    return {
      assets: [],
      archetypes: master.archetypes,
      hus: master.hus,
      projects: [],
      priorities: master.priorities,
      statuses: [],
      tasks: master.allTasks.map(toCamelCase),
      taskLogs: [],
      assetLastTaskMap: {},
      totalAssetCount: 0,
    };
  }

  const { master, assetsNeedingGrn, assetLastTaskMap, projects, grnTasks } =
    await getGrEligibleCached(client, period);

  return {
    assets: assetsNeedingGrn,
    archetypes: master.archetypes,
    hus: master.hus,
    projects,
    priorities: master.priorities,
    statuses: [],
    tasks: master.allTasks.map(toCamelCase),
    taskLogs: [],
    assetLastTaskMap,
    totalAssetCount: assetsNeedingGrn.length,
  };
}
