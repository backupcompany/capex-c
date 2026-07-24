import type {
  ArchetypeConfig,
  AssetTaskStatus,
  AssetTypeConfig,
  AssetTypeGroupConfig,
  BudgetPeriod,
  FeasibilityStudy,
  HospitalUnitConfig,
  Task,
} from '../types';
import { getAccessTokenForBackend } from '../lib/authSession';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';
import { resolveMyTasksAccessToken } from './myTasksApi';

export type FsUpdateBundle = {
  period: BudgetPeriod | null;
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
  assetTypes: AssetTypeConfig[];
  assetTypeGroups: AssetTypeGroupConfig[];
  assetTaskStatuses: AssetTaskStatus[];
  tasks: Task[];
  studies: FeasibilityStudy[];
  summary?: {
    totalProjects: number;
    totalAssets: number;
    totalStudies: number;
  };
};

export type FsProjectSavePatch = {
  id: string;
  axCode?: string | null;
  approvedBudget?: number;
  targetBudgetStart?: string | null;
  budgetRevenuePermonth?: number;
};

export type FsSaveResult = { ok: true } | { ok: false; error: string };

export type FsUpdateMetaResult = {
  periodName: string;
  masterData: {
    archetypes: ArchetypeConfig[];
    hus: HospitalUnitConfig[];
    assetTypes: AssetTypeConfig[];
    assetTypeGroups: AssetTypeGroupConfig[];
  };
  fsByProjectId: Record<string, { id: string; conclusion: string; amount: number }>;
  assetFSApprovalMap: Record<string, boolean>;
  filterOptions: { archetypes: string[]; hus: string[] };
  summary: {
    submittedQty: number;
    submittedAmountIdr: number;
    approvedQty: number;
    approvedAmountIdr: number;
    notApprovedQty: number;
  };
};

export type FsUpdateQueryBody = {
  periodName: string;
  userId: number;
  page: number;
  pageSize: number;
  search?: string;
  hus?: string[];
  sortBy?: string;
  showOnlyNotFSApproved?: boolean;
  focusNeedingApproval?: boolean;
  meetingArchetype?: string | null;
  scopeFilter?: { archetypeNames: string[]; huNames: string[] } | null;
};

export type FsUpdateQueryResult = {
  periodName: string;
  rows: Record<string, unknown>[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  filterOptions: { archetypes: string[]; hus: string[] };
};

export async function fetchFsUpdateBundleFromBackend(
  periodName: string,
  userId: number,
): Promise<FsUpdateBundle | null> {
  if (!periodName.trim()) return null;

  if (!isCapexBeConfigured()) {
    trackBackendFetch('fsUpdate.bundle', 'fallback', { reason: 'missing_base_url' });
    return null;
  }

  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);

  try {
    const data = await postToCapexBe<Partial<FsUpdateBundle>>(
      '/fs-update/page-bundle',
      { periodName: periodName.trim(), userId },
      accessToken,
    );
    trackBackendFetch('fsUpdate.bundle', 'success');
    return {
      period: data?.period ?? null,
      archetypes: Array.isArray(data?.archetypes) ? data.archetypes : [],
      hus: Array.isArray(data?.hus) ? data.hus : [],
      assetTypes: Array.isArray(data?.assetTypes) ? data.assetTypes : [],
      assetTypeGroups: Array.isArray(data?.assetTypeGroups) ? data.assetTypeGroups : [],
      assetTaskStatuses: Array.isArray(data?.assetTaskStatuses) ? data.assetTaskStatuses : [],
      tasks: Array.isArray(data?.tasks) ? data.tasks : [],
      studies: Array.isArray(data?.studies) ? data.studies : [],
      summary: data?.summary as FsUpdateBundle['summary'],
    };
  } catch (err) {
    trackBackendFetch('fsUpdate.bundle', 'fallback', {
      reason: 'http_error',
      httpStatus: err instanceof Error && 'status' in err ? (err as { status: number }).status : undefined,
    });
    return null;
  }
}

export async function saveFsProjectsViaBackend(
  userId: number,
  periodName: string,
  projects: FsProjectSavePatch[],
): Promise<FsSaveResult> {
  if (!isCapexBeConfigured() || projects.length === 0) {
    return { ok: false, error: 'Backend tidak dikonfigurasi atau tidak ada data untuk disimpan.' };
  }

  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);

  try {
    await postToCapexBe<{ ok?: boolean }>(
      '/fs-update/save',
      { userId, periodName: periodName.trim(), projects },
      accessToken,
    );
    trackBackendFetch('fsUpdate.save', 'success');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menyimpan FS via backend.';
    trackBackendFetch('fsUpdate.save', 'fallback', { reason: 'http_error' });
    return { ok: false, error: message };
  }
}

export async function fetchFsUpdateMetaFromBackend(
  periodName: string,
  userId: number,
  scopeFilter: FsUpdateQueryBody['scopeFilter'] = null,
): Promise<FsUpdateMetaResult | null> {
  if (!periodName.trim() || !isCapexBeConfigured()) return null;
  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  try {
    const data = await postToCapexBe<FsUpdateMetaResult>(
      '/fs-update/meta',
      { periodName: periodName.trim(), userId, scopeFilter },
      accessToken,
    );
    trackBackendFetch('fsUpdate.meta', 'success');
    return data;
  } catch {
    trackBackendFetch('fsUpdate.meta', 'fallback', { reason: 'http_error' });
    return null;
  }
}

export async function fetchFsUpdateQueryFromBackend(
  body: FsUpdateQueryBody,
): Promise<FsUpdateQueryResult | null> {
  if (!body.periodName?.trim() || !isCapexBeConfigured()) return null;
  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  try {
    const data = await postToCapexBe<FsUpdateQueryResult>('/fs-update/query', body, accessToken);
    trackBackendFetch('fsUpdate.query', 'success');
    return {
      ...data,
      rows: Array.isArray(data.rows) ? data.rows : [],
      filterOptions: data.filterOptions ?? { archetypes: [], hus: [] },
    };
  } catch {
    trackBackendFetch('fsUpdate.query', 'fallback', { reason: 'http_error' });
    return null;
  }
}

export async function findFsUpdateProjectFromBackend(
  periodName: string,
  userId: number,
  projectCode: string,
): Promise<Record<string, unknown> | null> {
  if (!periodName.trim() || !projectCode.trim() || !isCapexBeConfigured()) return null;
  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  try {
    const data = await postToCapexBe<{ project?: Record<string, unknown> }>(
      '/fs-update/find-project',
      { periodName: periodName.trim(), userId, projectCode: projectCode.trim() },
      accessToken,
    );
    trackBackendFetch('fsUpdate.findProject', 'success');
    return data?.project ?? null;
  } catch {
    trackBackendFetch('fsUpdate.findProject', 'fallback', { reason: 'http_error' });
    return null;
  }
}
