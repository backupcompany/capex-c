import type {
  ArchetypeConfig,
  EnrichedAsset,
  HospitalUnitConfig,
  Project,
  ProjectPriorityConfig,
} from '../types';
import { getAccessTokenForBackend } from '../lib/authSession';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';
import { resolveMyTasksAccessToken } from './myTasksApi';

export type PoUpdateBundle = {
  assets: EnrichedAsset[];
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
  projects: Project[];
  priorities: ProjectPriorityConfig[];
  assetHasPOMap?: Record<string, boolean>;
  assetLastTaskMap?: Record<string, string>;
  totalAssetCount?: number;
};

export type PoUpdateAssetWindow = {
  assets: EnrichedAsset[];
  projects: Project[];
  assetHasPOMap: Record<string, boolean>;
  assetLastTaskMap: Record<string, string>;
  totalAssetCount: number;
  page: number;
  pageSize: number;
};

export type PoUpdateWindowFilters = {
  search?: string;
  poStatus?: 'all' | 'hasPO' | 'noPO';
  focusNeedingPO?: boolean;
  focusNotReceived?: boolean;
  hus?: string[];
  priorities?: string[];
  finishedTasks?: string[];
  budgetFilter?: 'low' | 'high' | null;
  completionMin?: number;
  completionMax?: number;
  archetype?: string | null;
  assetTypeGroup?: string | null;
  sortBy?: 'assetName_asc' | 'projectName_asc' | 'consumedBudget_desc';
};

export type PoUpdateMaster = {
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
  priorities: ProjectPriorityConfig[];
  finishedTaskOptions?: string[];
  assetTypeGroupOptions?: string[];
};

export async function fetchPoUpdateMasterFromBackend(
  userId: number,
  periodName?: string,
): Promise<PoUpdateMaster | null> {
  if (!isCapexBeConfigured()) return null;
  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  try {
    const data = await postToCapexBe<PoUpdateMaster>(
      '/po-update/master',
      { userId, periodName: periodName?.trim() || undefined },
      accessToken,
    );
    trackBackendFetch('poUpdate.master', 'success');
    return {
      archetypes: Array.isArray(data?.archetypes) ? data.archetypes : [],
      hus: Array.isArray(data?.hus) ? data.hus : [],
      priorities: Array.isArray(data?.priorities) ? data.priorities : [],
      finishedTaskOptions: Array.isArray(data?.finishedTaskOptions) ? data.finishedTaskOptions : [],
      assetTypeGroupOptions: Array.isArray(data?.assetTypeGroupOptions) ? data.assetTypeGroupOptions : [],
    };
  } catch (err) {
    trackBackendFetch('poUpdate.master', 'fallback', { reason: 'http_error' });
    return null;
  }
}

export async function fetchPoUpdateAssetWindowFromBackend(
  userId: number,
  periodName: string,
  opts: { page: number; pageSize: number; filters: PoUpdateWindowFilters },
): Promise<PoUpdateAssetWindow | null> {
  if (!isCapexBeConfigured()) return null;
  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  try {
    const data = await postToCapexBe<Partial<PoUpdateAssetWindow>>(
      '/po-update/asset-window',
      {
        userId,
        periodName: periodName?.trim() || undefined,
        page: opts.page,
        pageSize: opts.pageSize,
        filters: opts.filters,
      },
      accessToken,
    );
    trackBackendFetch('poUpdate.assetWindow', 'success');
    return {
      assets: Array.isArray(data?.assets) ? data.assets : [],
      projects: Array.isArray(data?.projects) ? data.projects : [],
      assetHasPOMap: data?.assetHasPOMap ?? {},
      assetLastTaskMap: data?.assetLastTaskMap ?? {},
      totalAssetCount: typeof data?.totalAssetCount === 'number' ? data.totalAssetCount : 0,
      page: typeof data?.page === 'number' ? data.page : opts.page,
      pageSize: typeof data?.pageSize === 'number' ? data.pageSize : opts.pageSize,
    };
  } catch (err) {
    trackBackendFetch('poUpdate.assetWindow', 'fallback', { reason: 'http_error' });
    return null;
  }
}

export async function fetchPoUpdateBundleFromBackend(
  userId: number,
  periodName?: string,
): Promise<PoUpdateBundle | null> {
  if (!isCapexBeConfigured()) {
    trackBackendFetch('poUpdate.bundle', 'fallback', { reason: 'missing_base_url' });
    return null;
  }

  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);

  try {
    const data = await postToCapexBe<Partial<PoUpdateBundle>>(
      '/po-update/page-bundle',
      { userId, periodName: periodName?.trim() || undefined },
      accessToken,
    );
    trackBackendFetch('poUpdate.bundle', 'success');
    return {
      assets: Array.isArray(data?.assets) ? data.assets : [],
      archetypes: Array.isArray(data?.archetypes) ? data.archetypes : [],
      hus: Array.isArray(data?.hus) ? data.hus : [],
      projects: Array.isArray(data?.projects) ? data.projects : [],
      priorities: Array.isArray(data?.priorities) ? data.priorities : [],
      assetHasPOMap: data?.assetHasPOMap ?? {},
      assetLastTaskMap: data?.assetLastTaskMap ?? {},
      totalAssetCount: data?.totalAssetCount,
    };
  } catch (err) {
    trackBackendFetch('poUpdate.bundle', 'fallback', {
      reason: 'http_error',
      httpStatus: err instanceof Error && 'status' in err ? (err as { status: number }).status : undefined,
    });
    return null;
  }
}

export type PoAssetSavePatch = {
  id: string;
  projectId: string;
  poNumber?: string | null;
  cprId?: string | null;
  poDate?: string | null;
  consumedBudget?: number;
  isGoodsReceived?: boolean;
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
  qty?: number;
  receivedQty?: number;
  lifecycleStatus?: string | null;
};

export type PoSaveResult = { ok: true } | { ok: false; error: string };

export async function savePoAssetsViaBackend(
  userId: number,
  assets: PoAssetSavePatch[],
  options?: { poFieldsOnly?: boolean },
): Promise<PoSaveResult> {
  if (!isCapexBeConfigured() || assets.length === 0) {
    return { ok: false, error: 'Backend tidak dikonfigurasi atau tidak ada data untuk disimpan.' };
  }

  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);

  try {
    await postToCapexBe<{ ok?: boolean }>(
      '/po-update/save',
      { userId, assets, poFieldsOnly: options?.poFieldsOnly === true },
      accessToken,
    );
    trackBackendFetch('poUpdate.save', 'success');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menyimpan PO via backend.';
    trackBackendFetch('poUpdate.save', 'fallback', { reason: 'http_error' });
    return { ok: false, error: message };
  }
}
