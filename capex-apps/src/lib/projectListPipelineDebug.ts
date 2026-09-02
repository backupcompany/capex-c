import { useAuthStore } from '@/stores/authStore';

/** Must match capexbe PROJECT_LIST_DATA_POLICY — bump invalidates FE disk caches. */
export const PROJECT_LIST_DATA_POLICY = 'v12-code-fuzzy';

export const PROJECT_LIST_DATA_POLICY_MARKER_KEY = 'capex.projectList.dataPolicy';

export function readProjectListDataPolicyMarker(): string | null {
  if (typeof window === 'undefined') return null;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const value = storage.getItem(PROJECT_LIST_DATA_POLICY_MARKER_KEY);
      if (value) return value;
    } catch {
      /* quota / private mode */
    }
  }
  return null;
}

export function writeProjectListDataPolicyMarker(value: string): void {
  if (typeof window === 'undefined') return;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      storage.setItem(PROJECT_LIST_DATA_POLICY_MARKER_KEY, value);
      return;
    } catch {
      /* quota — try other storage */
    }
  }
}

export const PROJECT_LIST_DISK_CACHE_VERSION = 'capexProjectListTableCache:v2';

export type ProjectListPipelineDebug = {
  dataPolicy?: string;
  dbTruthCount?: number;
  dbMatchedCount?: number;
  afterProgressFilterCount?: number;
  returnedRowCount?: number;
  enrichDroppedCount?: number;
  cacheLayer?: string;
  defaultQuery?: boolean;
  scopeAll?: boolean;
};

export function logProjectListPipelineStage(
  stage: string,
  payload: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_PROJECT_LIST_DEBUG !== '1') {
    return;
  }
  // Skip after logout / anonymous — in-flight query effects must not keep logging.
  if (useAuthStore.getState().status !== 'authenticated') return;
  console.info(`[capex-project-list:${stage}]`, payload);
}

export function isStaleProjectListBundle(
  totalAssetCount: number | null | undefined,
  debug: ProjectListPipelineDebug | undefined,
): boolean {
  if (!debug?.defaultQuery) return false;
  if (debug.dataPolicy && debug.dataPolicy !== PROJECT_LIST_DATA_POLICY) return true;
  // forceEmpty / stale-scope cache: period has assets but matched none (not Super Admin all-scope).
  if (
    debug.scopeAll !== true &&
    typeof debug.dbTruthCount === 'number' &&
    debug.dbTruthCount > 0 &&
    typeof debug.dbMatchedCount === 'number' &&
    debug.dbMatchedCount === 0 &&
    (totalAssetCount ?? 0) === 0
  ) {
    return true;
  }
  if (typeof debug.dbMatchedCount === 'number') {
    return typeof totalAssetCount === 'number' && totalAssetCount < debug.dbMatchedCount;
  }
  if (
    typeof debug.dbTruthCount === 'number' &&
    typeof totalAssetCount === 'number' &&
    totalAssetCount < debug.dbTruthCount
  ) {
    return true;
  }
  return false;
}
