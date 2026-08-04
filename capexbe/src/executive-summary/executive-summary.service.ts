import { Injectable } from '@nestjs/common';
import { AuthZService } from '../auth/auth-z.service';
import { fetchAllRecords, toCamelCase } from '../project-list/supabase-helpers';
import { loadBudgetByPeriodName } from '../budget-hu/budget-period.loader';
import { FsAuthService } from '../fs/fs-auth.service';
import { CACHE_TTL_MS, cacheKeys } from '../shared/cache-keys';
import { CacheAsideService } from '../shared/cache-aside.service';
import {
  parseListFilters,
  parsePeriodUserBody,
  parseProjectsPageBody,
  type ExecutiveSummaryListFilters,
} from './executive-summary.dto';
import { loadExecutiveSummaryProjectsPage } from './executive-summary-projects.loader';
import { loadExecutiveSummaryStats } from './executive-summary-stats.loader';
import { loadExecutiveDashboardMetrics, loadExecutiveDashboardCharts } from './executive-summary-dashboard.loader';
import { loadExecutiveDashboardKpi } from './executive-summary-dashboard-kpi.loader';

const EXEC_DASHBOARD_CACHE_TTL_MS = CACHE_TTL_MS.DASHBOARD;

function filtersCacheKey(filters: ExecutiveSummaryListFilters): string {
  const hu = [...filters.huCodes].map((c) => c.trim().toLowerCase()).sort().join(',');
  return `${filters.archetypeId ?? ''}:${filters.capexType}:${filters.status}:${hu}`;
}

@Injectable()
export class ExecutiveSummaryService {
  constructor(
    private readonly fsAuth: FsAuthService,
    private readonly authZ: AuthZService,
    private readonly cacheAside: CacheAsideService,
  ) {}

  /** Lightweight period shell for header (no full project tree). */
  async loadPageBundle(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Executive Summary', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const pn = periodName.trim();

    const [periodRow, categoriesRaw, husRaw, archetypesRaw] = await Promise.all([
      client.from('budget_periods').select('period_name, start_date, end_date, multi_year_name').eq('period_name', pn).maybeSingle(),
      fetchAllRecords(client, 'budget_category_configs', 'id, name'),
      fetchAllRecords(client, 'hospital_units_config', 'id, code, name, archetype_id'),
      fetchAllRecords(client, 'archetypes_config', 'id, name'),
    ]);

    const periodMeta = periodRow.data
      ? {
          periodName: String(periodRow.data.period_name ?? pn),
          startDate: periodRow.data.start_date ?? '',
          endDate: periodRow.data.end_date ?? '',
          multiYearName: periodRow.data.multi_year_name ?? '',
        }
      : null;

    return {
      periodName: pn,
      periodMeta,
      categories: categoriesRaw ? categoriesRaw.map(toCamelCase) : [],
      hospitalUnits: husRaw ? husRaw.map(toCamelCase) : [],
      archetypes: archetypesRaw ? archetypesRaw.map(toCamelCase) : [],
    };
  }

  /** Aggregated KPI / lifecycle counts — server-side filters + search. */
  async loadStats(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Executive Summary', 'view');
    const filters = parseListFilters(body);
    const search = String((body as Record<string, unknown>)?.search ?? '').trim();
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    return loadExecutiveSummaryStats(client, periodName, filters, search);
  }

  /** Paginated portfolio registry rows. */
  async loadProjectsPage(accessToken: string, body: unknown) {
    const query = parseProjectsPageBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, query.userId, 'Executive Summary', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, query.userId);
    return loadExecutiveSummaryProjectsPage(client, query);
  }

  /** Fast KPI row — SQL aggregate, no asset pipeline scan. */
  async loadDashboardKpi(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Executive Summary', 'view');
    const filters = parseListFilters(body);
    const pn = periodName.trim();
    const cacheKey = cacheKeys.executiveDashboardKpi(userId, pn, filtersCacheKey(filters));

    return this.cacheAside.getOrLoad(cacheKey, EXEC_DASHBOARD_CACHE_TTL_MS, () =>
      this.computeDashboardKpi(accessToken, userId, pn, filters),
    );
  }

  /** Charts, alerts, top lists — heavy project/asset pipeline. */
  async loadDashboardCharts(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Executive Summary', 'view');
    const filters = parseListFilters(body);
    const pn = periodName.trim();
    const cacheKey = cacheKeys.executiveDashboardCharts(userId, pn, filtersCacheKey(filters));

    return this.cacheAside.getOrLoad(cacheKey, EXEC_DASHBOARD_CACHE_TTL_MS, () =>
      this.computeDashboardCharts(accessToken, userId, pn, filters),
    );
  }

  /** CEO dashboard aggregates — KPI, charts, alerts (archetype-scoped). */
  async loadDashboardMetrics(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Executive Summary', 'view');
    const filters = parseListFilters(body);
    const pn = periodName.trim();
    const cacheKey = cacheKeys.executiveDashboardMetrics(userId, pn, filtersCacheKey(filters));

    return this.cacheAside.getOrLoad(cacheKey, EXEC_DASHBOARD_CACHE_TTL_MS, () =>
      this.computeDashboardMetrics(accessToken, userId, pn, filters),
    );
  }

  private async periodMetaFromClient(
    client: Awaited<ReturnType<FsAuthService['getAuthenticatedRlsClient']>>['client'],
    pn: string,
  ) {
    const periodRow = await client
      .from('budget_periods')
      .select('period_name, start_date, end_date, multi_year_name')
      .eq('period_name', pn)
      .maybeSingle();
    return periodRow.data
      ? {
          periodName: String(periodRow.data.period_name ?? pn),
          startDate: periodRow.data.start_date ?? '',
          endDate: periodRow.data.end_date ?? '',
          multiYearName: periodRow.data.multi_year_name ?? '',
        }
      : null;
  }

  private async computeDashboardKpi(
    accessToken: string,
    userId: number,
    pn: string,
    filters: ExecutiveSummaryListFilters,
  ) {
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const [summary, periodMeta] = await Promise.all([
      loadExecutiveDashboardKpi(client, pn, filters),
      this.periodMetaFromClient(client, pn),
    ]);
    return { summary, periodMeta, updatedAt: new Date().toISOString() };
  }

  private async computeDashboardCharts(
    accessToken: string,
    userId: number,
    pn: string,
    filters: ExecutiveSummaryListFilters,
  ) {
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    return loadExecutiveDashboardCharts(client, pn, filters);
  }

  private async computeDashboardMetrics(
    accessToken: string,
    userId: number,
    pn: string,
    filters: ExecutiveSummaryListFilters,
  ) {
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);

    const [metrics, periodMeta] = await Promise.all([
      loadExecutiveDashboardMetrics(client, pn, filters),
      this.periodMetaFromClient(client, pn),
    ]);

    return { ...metrics, periodMeta };
  }

  /** Fallback: full budget tree (legacy clients only). */
  async loadFullPeriod(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Executive Summary', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const period = await loadBudgetByPeriodName(client, periodName.trim());
    return { period };
  }
}
