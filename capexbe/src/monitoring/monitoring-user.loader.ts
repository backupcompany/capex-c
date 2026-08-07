import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
  getAllUsers,
} from '../project-list/master-data.loader';
import type {
  MonitoringListFilters,
  MonitoringPageBundleDto,
  MonitoringScopeSummaryRow,
  MonitoringScreenDto,
  MonitoringUserRowDto,
  MonitoringUsersPageDto,
  MonitoringUsersQuery,
  UserActivityStatus,
} from './monitoring.dto';
import {
  buildScopeResolutionMaps,
  formatRoleNames,
  resolveUserScopes,
} from './scope-resolution';

const ONLINE_WINDOW_MS = 15 * 60 * 1000;
const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type ActivitySnapshot = {
  lastTaskMs: number;
  lastAdhocMs: number;
  lastSessionMs: number;
  lastLoginMs: number;
};

function maxMs(...values: number[]): number {
  return values.reduce((m, v) => (v > m ? v : m), 0);
}

function toMs(value: unknown): number {
  if (value == null || value === '') return 0;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function emptySummaryRow(key: string, label: string): MonitoringScopeSummaryRow {
  return { key, label, total: 0, online: 0, active: 0, dormant: 0, inactive: 0 };
}

function bumpSummary(row: MonitoringScopeSummaryRow, metric: MonitoringUserRowDto): void {
  row.total += 1;
  if (metric.isOnline) row.online += 1;
  if (metric.status === 'Active') row.active += 1;
  else if (metric.status === 'Dormant') row.dormant += 1;
  else row.inactive += 1;
}

function deriveStatus(lastActiveMs: number, nowMs: number, isOnline: boolean): UserActivityStatus {
  if (isOnline) return 'Active';
  if (lastActiveMs <= 0) return 'Inactive';
  if (lastActiveMs >= nowMs - ACTIVE_WINDOW_MS) return 'Active';
  return 'Dormant';
}

async function loadActivitySnapshot(admin: SupabaseClient): Promise<Map<number, ActivitySnapshot>> {
  const { data, error } = await admin.rpc('monitoring_user_activity_snapshot');
  if (error) throw new Error(`monitoring_user_activity_snapshot: ${error.message}`);
  const map = new Map<number, ActivitySnapshot>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const uid = Number(row.user_id);
    if (!Number.isFinite(uid)) continue;
    map.set(uid, {
      lastTaskMs: toMs(row.last_task_at),
      lastAdhocMs: toMs(row.last_adhoc_at),
      lastSessionMs: toMs(row.last_session_at),
      lastLoginMs: toMs(row.last_login_at),
    });
  }
  return map;
}

function buildUserMetrics(
  users: Awaited<ReturnType<typeof getAllUsers>>,
  scopeMaps: ReturnType<typeof buildScopeResolutionMaps>,
  activityByUser: Map<number, ActivitySnapshot>,
): MonitoringUserRowDto[] {
  const nowMs = Date.now();
  const onlineCutoff = nowMs - ONLINE_WINDOW_MS;
  return users.map((user) => {
    const uid = Number(user.id);
    const activity = activityByUser.get(uid);
    const lastSessionMs = activity?.lastSessionMs ?? 0;
    const lastActiveMs = maxMs(
      activity?.lastTaskMs ?? 0,
      activity?.lastAdhocMs ?? 0,
      lastSessionMs,
      activity?.lastLoginMs ?? 0,
    );
    const isOnline = lastSessionMs >= onlineCutoff;
    const scope = resolveUserScopes(user.assignments, scopeMaps);
    return {
      userId: uid,
      username: String(user.username ?? ''),
      email: String(user.email ?? ''),
      roleName: formatRoleNames(user.assignments),
      unitNames: Array.from(scope.unitNames).sort((a, b) => a.localeCompare(b)),
      archetypeNames: Array.from(scope.archetypeNames).sort((a, b) => a.localeCompare(b)),
      lastActiveAt: lastActiveMs > 0 ? new Date(lastActiveMs).toISOString() : null,
      status: deriveStatus(lastActiveMs, nowMs, isOnline),
      isOnline,
    };
  });
}

function applyFilters(rows: MonitoringUserRowDto[], filters: MonitoringListFilters): MonitoringUserRowDto[] {
  const search = filters.search.toLowerCase();
  return rows.filter((row) => {
    if (filters.status === 'online' && !row.isOnline) return false;
    if (filters.status !== 'all' && filters.status !== 'online' && row.status !== filters.status) {
      return false;
    }
    if (filters.archetypeName && !row.archetypeNames.includes(filters.archetypeName)) return false;
    if (filters.unitName && !row.unitNames.includes(filters.unitName)) return false;
    if (!search) return true;
    const hay = [row.username, row.email, row.roleName, ...row.unitNames, ...row.archetypeNames]
      .join(' ')
      .toLowerCase();
    return hay.includes(search);
  });
}

function buildScopeSummaries(
  rows: MonitoringUserRowDto[],
  archetypes: { id: string; name: string }[],
  hospitalUnits: { id: string; name: string; archetypeId: string }[],
): { archetypeSummary: MonitoringScopeSummaryRow[]; unitSummary: MonitoringScopeSummaryRow[] } {
  const archMap = new Map<string, MonitoringScopeSummaryRow>();
  const unitMap = new Map<string, MonitoringScopeSummaryRow>();

  for (const arch of archetypes) {
    archMap.set(arch.name, emptySummaryRow(arch.id, arch.name));
  }
  for (const hu of hospitalUnits) {
    unitMap.set(hu.name, emptySummaryRow(hu.id, hu.name));
  }

  for (const row of rows) {
    for (const arch of row.archetypeNames) {
      const entry = archMap.get(arch);
      if (entry) bumpSummary(entry, row);
    }
    for (const unit of row.unitNames) {
      const entry = unitMap.get(unit);
      if (entry) bumpSummary(entry, row);
    }
  }

  return {
    archetypeSummary: Array.from(archMap.values()).sort((a, b) => b.active - a.active || a.label.localeCompare(b.label)),
    unitSummary: Array.from(unitMap.values()).sort((a, b) => b.active - a.active || a.label.localeCompare(b.label)),
  };
}

export function buildPageBundleFromContext(
  ctx: Awaited<ReturnType<typeof loadMonitoringContext>>,
): MonitoringPageBundleDto {
  const { archetypeSummary, unitSummary } = buildScopeSummaries(ctx.allRows, ctx.archetypes, ctx.hospitalUnits);
  return {
    summary: {
      totalUsers: ctx.allRows.length,
      onlineNow: ctx.allRows.filter((r) => r.isOnline).length,
      activeUsers: ctx.allRows.filter((r) => r.status === 'Active').length,
      dormantUsers: ctx.allRows.filter((r) => r.status === 'Dormant').length,
      inactiveUsers: ctx.allRows.filter((r) => r.status === 'Inactive').length,
    },
    archetypeSummary,
    unitSummary,
    unitNames: ctx.hospitalUnits.map((hu) => hu.name).filter(Boolean),
  };
}

export async function loadMonitoringContext(admin: SupabaseClient) {
  const [users, archetypesRaw, husRaw, activityByUser] = await Promise.all([
    getAllUsers(admin),
    getAllArchetypesConfig(admin),
    getAllHospitalUnitsConfig(admin),
    loadActivitySnapshot(admin),
  ]);

  const archetypes = archetypesRaw
    .map((a) => ({
      id: String(a.id ?? ''),
      name: String(a.name ?? '').trim(),
    }))
    .filter((a) => a.name);
  const hospitalUnits = husRaw
    .map((hu) => ({
      id: String(hu.id ?? ''),
      name: String(hu.name ?? '').trim(),
      archetypeId: String(hu.archetypeId ?? ''),
    }))
    .filter((hu) => hu.name);

  const scopeMaps = buildScopeResolutionMaps(archetypes, hospitalUnits);
  const allRows = buildUserMetrics(users, scopeMaps, activityByUser);

  return { allRows, archetypes, hospitalUnits };
}

export async function loadMonitoringPageBundle(admin: SupabaseClient): Promise<MonitoringPageBundleDto> {
  const ctx = await loadMonitoringContext(admin);
  return buildPageBundleFromContext(ctx);
}

export async function loadMonitoringUsersPage(
  _admin: SupabaseClient,
  query: MonitoringUsersQuery,
  preloadedRows?: MonitoringUserRowDto[],
): Promise<MonitoringUsersPageDto> {
  const allRows = preloadedRows ?? (await loadMonitoringContext(_admin)).allRows;
  const filtered = applyFilters(allRows, query);
  filtered.sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    if (a.status !== b.status) {
      const order: Record<UserActivityStatus, number> = { Active: 0, Dormant: 1, Inactive: 2 };
      return order[a.status] - order[b.status];
    }
    const roleCmp = a.roleName.localeCompare(b.roleName, 'id');
    if (roleCmp !== 0) return roleCmp;
    const aTime = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
    const bTime = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
    return bTime - aTime;
  });

  const from = (query.page - 1) * query.pageSize;
  const slice = filtered.slice(from, from + query.pageSize);
  return {
    rows: slice,
    page: query.page,
    pageSize: query.pageSize,
    totalCount: filtered.length,
    hasMore: from + query.pageSize < filtered.length,
  };
}

export async function loadMonitoringScreen(
  admin: SupabaseClient,
  query: MonitoringUsersQuery,
  preloadedCtx?: Awaited<ReturnType<typeof loadMonitoringContext>>,
): Promise<MonitoringScreenDto> {
  const ctx = preloadedCtx ?? (await loadMonitoringContext(admin));
  const usersPage = await loadMonitoringUsersPage(admin, query, ctx.allRows);
  return {
    bundle: buildPageBundleFromContext(ctx),
    usersPage,
  };
}
