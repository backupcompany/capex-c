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

export type GrUpdateBundle = {
  assets: EnrichedAsset[];
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
  projects: Project[];
  priorities: ProjectPriorityConfig[];
  statuses: AssetTaskStatus[];
  tasks: Task[];
  taskLogs: TaskLog[];
};

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
