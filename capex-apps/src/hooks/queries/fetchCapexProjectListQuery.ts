import { fetchProjectListPageBundle, fetchProjectListQuery } from '@/services/capexProjectListApi';
import type { ProjectListQueryParams, ProjectListQueryResult } from '@/services/projectListQueryTypes';
import { invalidateRequestCache, withRequestCache } from '@/lib/requestCache';

export type { ProjectListQueryParams, ProjectListQueryResult };

const QUERY_REQUEST_TTL_MS = 5 * 60 * 1000;
/** Bump when server-side list read policy changes (invalidates stale table disk cache). */
const PROJECT_LIST_SCOPE_CACHE_REVISION = 'v12-code-fuzzy';

function isSuspiciousEmptyList(result: ProjectListQueryResult): boolean {
  const d = result._debug;
  if (!d || d.scopeAll === true) return false;
  // Only unfiltered default pages — empty search/filter results are valid.
  if (d.defaultQuery !== true) return false;
  return (
    (result.totalAssetCount ?? 0) === 0 &&
    typeof d.dbTruthCount === 'number' &&
    d.dbTruthCount > 0 &&
    typeof d.dbMatchedCount === 'number' &&
    d.dbMatchedCount === 0
  );
}

async function fetchQueryBypassingStaleEmpty(
  params: ProjectListQueryParams,
  accessToken: string | null | undefined,
  cacheKey: string,
  fetcher: (p: ProjectListQueryParams, signal?: AbortSignal) => Promise<ProjectListQueryResult>,
  signal?: AbortSignal,
): Promise<ProjectListQueryResult> {
  if (params.skipCache) return fetcher(params, signal);

  const cached = await withRequestCache(cacheKey, () => fetcher(params, signal), QUERY_REQUEST_TTL_MS);
  if (!isSuspiciousEmptyList(cached)) return cached;

  // ponytail: one retry after role/scope change left empty forceEmpty in FE/BE cache
  invalidateRequestCache(cacheKey);
  return fetcher({ ...params, skipCache: true }, signal);
}

/** Server-side table fetch with in-flight dedupe (disk write di halaman / prefetch). */
export async function fetchCapexProjectListQuery(
  params: ProjectListQueryParams,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<ProjectListQueryResult> {
  const cacheKey = `capex-project-list:query:${projectListFiltersCacheKey(params)}:${params.page}:${params.pageSize}`;
  return fetchQueryBypassingStaleEmpty(
    params,
    accessToken,
    cacheKey,
    (p, sig) => fetchProjectListQuery(p, accessToken, sig),
    signal,
  );
}

/** Alias — same payload as query; prefers `/project-list/page-bundle` when available. */
export async function fetchCapexProjectListPageBundle(
  params: ProjectListQueryParams,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<ProjectListQueryResult> {
  const cacheKey = `capex-project-list:page-bundle:${projectListFiltersCacheKey(params)}:${params.page}:${params.pageSize}`;
  return fetchQueryBypassingStaleEmpty(
    params,
    accessToken,
    cacheKey,
    (p, sig) => fetchProjectListPageBundle(p, accessToken, sig),
    signal,
  );
}

export function projectListFiltersCacheKey(filters: ProjectListQueryParams): string {
  const { page: _p, pageSize: _s, skipCache: _c, exportAll: _e, ...rest } = filters;
  return `${PROJECT_LIST_SCOPE_CACHE_REVISION}:${JSON.stringify(rest)}`;
}
