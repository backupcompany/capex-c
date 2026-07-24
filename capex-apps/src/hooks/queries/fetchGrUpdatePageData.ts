import type { QueryClient } from '@tanstack/react-query';
import type { ArchetypeConfig, EnrichedAsset, HospitalUnitConfig, ProjectPriorityConfig, Task } from '@/types';
import { TaskCurrentStatus } from '@/types';
import { taskHasTriggerEvent } from '@/lib/systemTriggerEvents';
import { fetchGrUpdateBundleFromBackend, type GrUpdateBundle } from '@/services/grUpdateApi';
import { readPageSnapshot, writePageSnapshot } from '@/lib/pageSnapshotCache';
import { queryKeys } from '@/lib/query-keys';

const GR_STALE_MS = 120_000;

const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();
const GR_SNAPSHOT_KEY = 'gr-update';

export type GrUpdatePageData = {
  assets: EnrichedAsset[];
  masterData: {
    archetypes: ArchetypeConfig[];
    hus: HospitalUnitConfig[];
    projects: unknown[];
    priorities: ProjectPriorityConfig[];
  };
  assetLastTaskMap: Record<string, string>;
  tasks: Task[];
};

function buildGrUpdatePageFromBundle(beBundle: GrUpdateBundle): GrUpdatePageData {
  const {
    assets,
    archetypes,
    hus,
    projects,
    priorities,
    statuses: allStatuses,
    tasks: allTasks,
    taskLogs: allTaskLogs,
  } = beBundle;

  const grnTasks = allTasks.filter((task) => {
    const taskNameLower = normalize(task.name);
    return (
      taskNameLower.includes('grn') ||
      taskNameLower.includes('good received') ||
      taskNameLower.includes('goods received') ||
      taskHasTriggerEvent(task, 'PO_GOODS_RECEIVED')
    );
  });

  const assetGrnCompletedMap = new Map<string, boolean>();
  const grnTaskIds = new Set(grnTasks.map((t) => t.id));

  allStatuses.forEach((status) => {
    if (grnTaskIds.has(status.taskId) && status.status === TaskCurrentStatus.Done) {
      assetGrnCompletedMap.set(status.assetId, true);
    }
  });

  allTaskLogs.forEach((log) => {
    if (grnTaskIds.has(log.taskId)) {
      assetGrnCompletedMap.set(log.assetId, true);
    }
  });

  const assetsNeedingGRN = assets.filter((asset) => {
    const hasGrnCompleted = assetGrnCompletedMap.get(asset.id) || false;
    const receivedQty = (asset as { receivedQty?: number }).receivedQty || 0;
    const isReceived = asset.isGoodsReceived || receivedQty > 0;
    const hasPO = asset.poNumber && asset.poNumber.trim() !== '';
    const hasConsumedBudget = asset.consumedBudget > 0;

    if (grnTasks.length === 0) {
      return hasPO || isReceived || hasConsumedBudget;
    }
    return !hasGrnCompleted && (hasPO || isReceived || hasConsumedBudget);
  });

  const lastTaskMap = new Map<string, string>();
  const logsByAsset = allTaskLogs.reduce((acc, log) => {
    if (!acc.has(log.assetId)) acc.set(log.assetId, []);
    acc.get(log.assetId)!.push(log);
    return acc;
  }, new Map<string, typeof allTaskLogs>());

  allStatuses.forEach((status) => {
    const logs = logsByAsset.get(status.assetId) || [];
    if (logs.length > 0) {
      const sortedLogs = logs.sort(
        (a, b) => new Date(b.completedAt || '').getTime() - new Date(a.completedAt || '').getTime(),
      );
      const lastLog = sortedLogs[0];
      const lastTask = allTasks.find((t) => t.id === lastLog.taskId);
      if (lastTask) {
        lastTaskMap.set(status.assetId, lastTask.name);
      }
    }
  });

  const assetsWithReceivedQty = assetsNeedingGRN.map((asset) => ({
    ...asset,
    receivedQty: (asset as { receivedQty?: number }).receivedQty ?? 0,
    qty: (asset as { qty?: number }).qty ?? 1,
  }));

  return {
    assets: assetsWithReceivedQty,
    masterData: { archetypes, hus, projects, priorities },
    assetLastTaskMap: Object.fromEntries(lastTaskMap.entries()),
    tasks: allTasks,
  };
}

export async function fetchGrUpdatePageData(
  userId: number,
  periodName?: string,
  signal?: AbortSignal,
): Promise<GrUpdatePageData> {
  const period = periodName?.trim() || '';
  const beBundle = await fetchGrUpdateBundleFromBackend(userId, period, signal);
  const out = buildGrUpdatePageFromBundle(beBundle);

  writePageSnapshot(`${GR_SNAPSHOT_KEY}:${period}:${userId}`, {
    assets: out.assets,
    masterData: out.masterData,
    assetLastTaskMap: out.assetLastTaskMap,
    tasks: out.tasks,
  });

  return out;
}

export function resolveGrUpdateInitialData(
  queryClient: QueryClient,
  userId: number,
  periodName?: string,
): GrUpdatePageData | undefined {
  const period = periodName?.trim() || '';
  return (
    queryClient.getQueryData<GrUpdatePageData>(queryKeys.grUpdate.page(period, userId)) ??
    readGrUpdateSnapshot(userId, period) ??
    undefined
  );
}

export function prefetchGrUpdatePage(
  queryClient: QueryClient,
  userId: number,
  periodName?: string,
): Promise<void> {
  const period = periodName?.trim() || '';
  if (queryClient.getQueryState(queryKeys.grUpdate.page(period, userId))?.fetchStatus === 'fetching') {
    return Promise.resolve();
  }
  return queryClient
    .prefetchQuery({
      queryKey: queryKeys.grUpdate.page(period, userId),
      queryFn: () => fetchGrUpdatePageData(userId, period),
      staleTime: GR_STALE_MS,
    })
    .then(() => undefined);
}

/** Read session snapshot for instant placeholder while the network request runs. */
export function readGrUpdateSnapshot(userId: number, periodName?: string): GrUpdatePageData | null {
  const period = periodName?.trim() || '';
  const cached = readPageSnapshot<{
    assets: EnrichedAsset[];
    masterData: GrUpdatePageData['masterData'];
    assetLastTaskMap: Record<string, string>;
    tasks?: Task[];
  }>(`${GR_SNAPSHOT_KEY}:${period}:${userId}`);
  if (!cached?.assets?.length) {
    const legacy = readPageSnapshot<typeof cached>(`${GR_SNAPSHOT_KEY}:${userId}`);
    if (legacy?.assets?.length) return {
      assets: legacy.assets,
      masterData: legacy.masterData,
      assetLastTaskMap: legacy.assetLastTaskMap || {},
      tasks: legacy.tasks ?? [],
    };
    return null;
  }
  return {
    assets: cached.assets,
    masterData: cached.masterData,
    assetLastTaskMap: cached.assetLastTaskMap || {},
    tasks: cached.tasks ?? [],
  };
}
