import type {
  UserActivityMetric,
  UserMonitoringPageBundle,
  UserMonitoringScreen,
  UserMonitoringUsersPage,
} from '../types';
import { isBackendConfigured, postBackend } from '../lib/backendApiClient';

export type UserMonitoringListFilters = {
  search: string;
  status: 'all' | 'Active' | 'Dormant' | 'Inactive' | 'online';
  archetypeName: string | null;
  unitName: string | null;
};

export type UserMonitoringUsersQueryParams = UserMonitoringListFilters & {
  userId: number;
  page: number;
  pageSize: number;
};

export function userMonitoringFiltersCacheKey(filters: UserMonitoringListFilters): string {
  return [
    filters.search.trim().toLowerCase(),
    filters.status,
    filters.archetypeName ?? '',
    filters.unitName ?? '',
  ].join('\u0001');
}

function normalizePageBundle(data: Partial<UserMonitoringPageBundle> | undefined): UserMonitoringPageBundle {
  const legacy = data as (Partial<UserMonitoringPageBundle> & { hospitalUnits?: { name?: string }[] }) | undefined;
  const unitNames = Array.isArray(data?.unitNames)
    ? data!.unitNames.map(String).filter(Boolean)
    : Array.isArray(legacy?.hospitalUnits)
      ? legacy!.hospitalUnits!.map((hu) => String(hu.name ?? '')).filter(Boolean)
      : [];
  return {
    summary: {
      totalUsers: Number(data?.summary?.totalUsers ?? 0),
      onlineNow: Number(data?.summary?.onlineNow ?? 0),
      activeUsers: Number(data?.summary?.activeUsers ?? 0),
      dormantUsers: Number(data?.summary?.dormantUsers ?? 0),
      inactiveUsers: Number(data?.summary?.inactiveUsers ?? 0),
    },
    archetypeSummary: Array.isArray(data?.archetypeSummary) ? data.archetypeSummary : [],
    unitSummary: Array.isArray(data?.unitSummary) ? data.unitSummary : [],
    unitNames,
  };
}

function normalizeUsersPage(
  data: Partial<UserMonitoringUsersPage> | undefined,
  fallback: Pick<UserMonitoringUsersQueryParams, 'page' | 'pageSize'>,
): UserMonitoringUsersPage {
  return {
    rows: Array.isArray(data?.rows) ? (data.rows as UserActivityMetric[]) : [],
    page: Number(data?.page ?? fallback.page),
    pageSize: Number(data?.pageSize ?? fallback.pageSize),
    totalCount: Number(data?.totalCount ?? 0),
    hasMore: Boolean(data?.hasMore),
  };
}

/** @deprecated Prefer fetchUserMonitoringScreenFromBackend — one round trip for bundle + table. */
export async function fetchUserMonitoringPageBundleFromBackend(
  userId: number,
): Promise<UserMonitoringPageBundle | null> {
  if (!isBackendConfigured()) return null;
  const data = await postBackend<Partial<UserMonitoringPageBundle>>(
    '/monitoring/page-bundle',
    { userId },
    { source: 'userMonitoring.pageBundle' },
  );
  if (!data) return null;
  return normalizePageBundle(data);
}

/** @deprecated Prefer fetchUserMonitoringScreenFromBackend when bundle is also needed. */
export async function fetchUserMonitoringUsersPageFromBackend(
  params: UserMonitoringUsersQueryParams,
): Promise<UserMonitoringUsersPage | null> {
  if (!isBackendConfigured()) return null;
  const data = await postBackend<Partial<UserMonitoringUsersPage>>(
    '/monitoring/users/query',
    {
      userId: params.userId,
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      status: params.status,
      archetypeName: params.archetypeName ?? undefined,
      unitName: params.unitName ?? undefined,
    },
    { source: 'userMonitoring.usersQuery' },
  );
  if (!data) return null;
  return normalizeUsersPage(data, params);
}

export async function fetchUserMonitoringScreenFromBackend(
  params: UserMonitoringUsersQueryParams,
): Promise<UserMonitoringScreen | null> {
  if (!isBackendConfigured()) return null;
  const data = await postBackend<Partial<UserMonitoringScreen>>(
    '/monitoring/screen',
    {
      userId: params.userId,
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      status: params.status,
      archetypeName: params.archetypeName ?? undefined,
      unitName: params.unitName ?? undefined,
    },
    { source: 'userMonitoring.screen' },
  );
  if (!data) return null;
  return {
    bundle: normalizePageBundle(data.bundle),
    usersPage: normalizeUsersPage(data.usersPage, params),
  };
}

/** @deprecated Legacy single-shot bundle — prefer screen endpoint. */
export type UserMonitoringBundle = {
  users: UserActivityMetric[];
  roles: never[];
};

export async function fetchUserMonitoringBundleFromBackend(
  userId?: number,
): Promise<UserMonitoringBundle | null> {
  if (!Number.isFinite(userId)) return null;
  const screen = await fetchUserMonitoringScreenFromBackend({
    userId: userId as number,
    page: 1,
    pageSize: 25,
    search: '',
    status: 'all',
    archetypeName: null,
    unitName: null,
  });
  if (!screen) return null;
  return {
    users: screen.usersPage.rows,
    roles: [],
  };
}
