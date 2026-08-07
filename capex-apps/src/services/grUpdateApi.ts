import type {
  ArchetypeConfig,
  AssetTaskStatus,
  EnrichedAsset,
  HospitalUnitConfig,
  Project,
  ProjectPriorityConfig,
  Task,
  TaskLog,
} from '../types';
import { isBackendConfigured, postBackend } from '../lib/backendApiClient';
import { isCapexBeConfigured } from '../lib/capexBeClient';
import { resolveMyTasksAccessToken } from './myTasksApi';
import { getAccessTokenForBackend } from '../lib/authSession';
import { useBackendSession } from '../lib/auth/authConstants';
import { useBeBffProxy } from '../lib/capexBeClient';
import { postToCapexBe } from '../lib/capexBeClient';
import { parseApiResponseOrFallback } from '../lib/validation/parseApiResponse';
import {
  EMPTY_GR_UPDATE_BUNDLE,
  grUpdateBundleSchema,
} from '../lib/validation/schemas/grUpdate.schema';

export type GrUpdateWindowFilters = {
  search?: string;
  grStatus?: 'all' | 'notReceived' | 'partiallyReceived' | 'fullyReceived';
  hus?: string[];
  priorities?: string[];
  finishedTasks?: string[];
  budgetFilter?: 'low' | 'high' | null;
  completionMin?: number;
  completionMax?: number;
  archetype?: string | null;
  assetTypeGroup?: string | null;
  sortBy?: 'assetName_asc' | 'projectName_asc' | 'receivedQty_desc';
};

export type GrUpdateMaster = {
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
  priorities: ProjectPriorityConfig[];
  grnTasks: Task[];
  finishedTaskOptions?: string[];
  assetTypeGroupOptions?: string[];
};

export type GrUpdateAssetWindow = {
  assets: EnrichedAsset[];
  projects: Project[];
  assetLastTaskMap: Record<string, string>;
  totalAssetCount: number;
  page: number;
  pageSize: number;
};

export type GrUpdateBundle = {
  assets: EnrichedAsset[];
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
  projects: Project[];
  priorities: ProjectPriorityConfig[];
  statuses: AssetTaskStatus[];
  tasks: Task[];
  taskLogs: TaskLog[];
  assetLastTaskMap?: Record<string, string>;
  totalAssetCount?: number;
};

export async function fetchGrUpdateMasterFromBackend(
  userId: number,
  periodName?: string,
): Promise<GrUpdateMaster | null> {
  if (!isCapexBeConfigured()) return null;
  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  try {
    const data = await postToCapexBe<GrUpdateMaster>(
      '/gr-update/master',
      { userId, periodName: periodName?.trim() || undefined },
      accessToken,
    );
    return {
      archetypes: Array.isArray(data?.archetypes) ? data.archetypes : [],
      hus: Array.isArray(data?.hus) ? data.hus : [],
      priorities: Array.isArray(data?.priorities) ? data.priorities : [],
      grnTasks: Array.isArray(data?.grnTasks) ? data.grnTasks : [],
      finishedTaskOptions: Array.isArray(data?.finishedTaskOptions) ? data.finishedTaskOptions : [],
      assetTypeGroupOptions: Array.isArray(data?.assetTypeGroupOptions) ? data.assetTypeGroupOptions : [],
    };
  } catch {
    return null;
  }
}

export async function fetchGrUpdateAssetWindowFromBackend(
  userId: number,
  periodName: string,
  opts: { page: number; pageSize: number; filters: GrUpdateWindowFilters },
): Promise<GrUpdateAssetWindow | null> {
  if (!isCapexBeConfigured()) return null;
  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  try {
    const data = await postToCapexBe<Partial<GrUpdateAssetWindow>>(
      '/gr-update/asset-window',
      {
        userId,
        periodName: periodName?.trim() || undefined,
        page: opts.page,
        pageSize: opts.pageSize,
        filters: opts.filters,
      },
      accessToken,
    );
    return {
      assets: Array.isArray(data?.assets) ? data.assets : [],
      projects: Array.isArray(data?.projects) ? data.projects : [],
      assetLastTaskMap: data?.assetLastTaskMap ?? {},
      totalAssetCount: typeof data?.totalAssetCount === 'number' ? data.totalAssetCount : 0,
      page: typeof data?.page === 'number' ? data.page : opts.page,
      pageSize: typeof data?.pageSize === 'number' ? data.pageSize : opts.pageSize,
    };
  } catch {
    return null;
  }
}

export async function fetchGrUpdateBundleFromBackend(
  userId: number,
  periodName?: string,
  signal?: AbortSignal,
): Promise<GrUpdateBundle> {
  const period = periodName?.trim() || '';
  const data = await postBackend<unknown>(
    '/gr-update/page-bundle',
    { userId, periodName: period || undefined },
    { source: 'grUpdate.bundle', timeoutMs: 30_000, requireAuth: true, signal },
  );

  if (!data) {
    if (isCapexBeConfigured()) {
      throw new Error('Gagal memuat data GR Update dari backend.');
    }
    throw new Error('GR Update membutuhkan capexbe — set NEXT_PUBLIC_CAPEXBE_URL.');
  }

  return parseApiResponseOrFallback(
    'gr-update/page-bundle',
    grUpdateBundleSchema,
    data,
    EMPTY_GR_UPDATE_BUNDLE,
  );
}

export type GrAssetSavePatch = {
  id: string;
  projectId: string;
  poNumber?: string | null;
  consumedBudget?: number;
  isGoodsReceived?: boolean;
  receivedQty?: number;
  qty?: number;
  assetCode?: string;
  assetName?: string;
  description?: string;
  budgetPlan?: number;
  budgetAllocated?: number;
  workflowSetId?: string;
  budgetCategoryId?: string;
  endTargetDate?: string | null;
  catalogueId?: string | null;
  bddPriority?: string | null;
  assetTypeId?: string | null;
  lifecycleStatus?: string | null;
};

export async function saveGrAssetsViaBackend(
  userId: number,
  assets: GrAssetSavePatch[],
): Promise<boolean> {
  if (assets.length === 0) return false;
  if (!isBackendConfigured() && !useBeBffProxy()) return false;

  const bff = useBeBffProxy();
  const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  if (!bff && !useBackendSession() && !token) return false;

  try {
    await postToCapexBe<{ ok?: boolean }>('/gr-update/save', { userId, assets }, token);
    return true;
  } catch {
    return false;
  }
}
