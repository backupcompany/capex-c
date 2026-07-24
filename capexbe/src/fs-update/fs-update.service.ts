import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthZService } from '../auth/auth-z.service';
import { buildFsQueryPageFromDb } from '../fs/fs-query.dto';
import { fetchAllRecords, fetchRecordsInBatches, toCamelCase } from '../project-list/supabase-helpers';
import { fetchRecordsByAssetIds } from '../project-list/supabase-helpers';
import {
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
  getAllTasks,
} from '../project-list/master-data.loader';
import { loadBudgetByPeriodName } from '../budget-hu/budget-period.loader';
import { FsAuthService } from '../fs/fs-auth.service';
import { invalidateFsScreenCaches } from '../fs/fs-cache-invalidation.util';
import { buildScopedFsFilterOptions } from '../fs/fs-hu-scope.util';
import { parsePeriodUserBody } from '../fs/fs.dto';
import {
  buildFsProjectPatchUpdate,
  FS_ASSET_SELECT,
  FS_PROJECT_SELECT,
  FS_STUDY_COLUMNS_BUNDLE,
  type FsProjectPatchInput,
} from '../fs/fs-db.constants';
import { CACHE_TTL_MS, cacheKeys } from '../shared/cache-keys';
import { CacheAsideService } from '../shared/cache-aside.service';
import {
  enrichFsUpdateProjectPage,
} from './fs-update-enrichment.util';
import { loadFsUpdateMetaFromDb } from './fs-update-meta.loader';
import { loadFsUpdateProjectsPage } from './fs-update-projects-page.loader';
import {
  parseFsUpdateFindProjectBody,
  parseFsUpdateMetaBody,
  parseFsUpdateQuery,
} from './fs-update-query.dto';

type FsProjectPatch = FsProjectPatchInput & { id: string };

type FsPageBundle = Awaited<ReturnType<FsUpdateService['loadPageBundleUncached']>>;

const FS_PAGE_CACHE_TTL_MS = CACHE_TTL_MS.TABLE;
const FS_FIELDS_UPDATE_CONCURRENCY = 30;

@Injectable()
export class FsUpdateService {
  constructor(
    private readonly fsAuth: FsAuthService,
    private readonly authZ: AuthZService,
    private readonly cacheAside: CacheAsideService,
  ) {}

  private parseUserId(body: { userId?: number }): number {
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('Invalid userId');
    }
    return userId;
  }

  private extractPeriodIds(period: any | null): { projectIds: string[]; assetIds: string[] } {
    if (!period?.archetypes) return { projectIds: [], assetIds: [] };
    const projectIds: string[] = [];
    const assetIds: string[] = [];
    for (const archetype of period.archetypes) {
      for (const hu of archetype.units || []) {
        for (const project of hu.projects || []) {
          projectIds.push(String(project.id));
          for (const asset of project.assets || []) {
            assetIds.push(String(asset.id));
          }
        }
      }
    }
    return { projectIds, assetIds };
  }

  private async fetchStudiesByProjectIds(client: SupabaseClient, projectIds: string[]): Promise<any[]> {
    if (projectIds.length === 0) return [];
    const out: any[] = [];
    const chunkSize = 150;
    for (let i = 0; i < projectIds.length; i += chunkSize) {
      const chunk = projectIds.slice(i, i + chunkSize);
      const { data, error } = await client
        .from('feasibility_studies')
        .select(FS_STUDY_COLUMNS_BUNDLE)
        .in('project_id', chunk);
      if (error) throw new Error(`feasibility_studies(project_id in): ${error.message}`);
      if (data?.length) out.push(...data);
    }
    return out;
  }

  private async loadPageBundleUncached(client: SupabaseClient, periodName: string) {
    const pn = periodName.trim();
    const [period, archetypes, hus, assetTypesRaw, assetTypeGroupsRaw, tasks] = await Promise.all([
      loadBudgetByPeriodName(client, pn, { fsView: true }),
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
      fetchAllRecords(client, 'asset_type_configs', 'id,name,group_id,is_active'),
      fetchAllRecords(client, 'asset_type_groups', 'id,name'),
      getAllTasks(client),
    ]);
    const { projectIds, assetIds } = this.extractPeriodIds(period);
    const [assetTaskStatusesRaw, studiesRaw] = await Promise.all([
      assetIds.length
        ? fetchRecordsByAssetIds(client, 'asset_task_statuses', assetIds)
        : Promise.resolve([]),
      this.fetchStudiesByProjectIds(client, projectIds),
    ]);

    return {
      period,
      archetypes,
      hus,
      assetTypes: assetTypesRaw ? assetTypesRaw.map(toCamelCase) : [],
      assetTypeGroups: assetTypeGroupsRaw ? assetTypeGroupsRaw.map(toCamelCase) : [],
      assetTaskStatuses: assetTaskStatusesRaw ? assetTaskStatusesRaw.map(toCamelCase) : [],
      tasks,
      studies: studiesRaw ? studiesRaw.map(toCamelCase) : [],
      summary: {
        totalProjects: projectIds.length,
        totalAssets: assetIds.length,
        totalStudies: studiesRaw?.length ?? 0,
      },
    };
  }

  private async loadPageBundleCached(client: SupabaseClient, userId: number, periodName: string) {
    const cacheKey = cacheKeys.fsUpdatePage(userId, periodName);
    return this.cacheAside.getOrLoad(cacheKey, FS_PAGE_CACHE_TTL_MS, () =>
      this.loadPageBundleUncached(client, periodName),
    );
  }

  async loadPageBundle(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    return this.loadPageBundleCached(client, userId, periodName.trim());
  }

  async loadMeta(accessToken: string, body: unknown) {
    const { userId, periodName, scopeFilter } = parseFsUpdateMetaBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const pn = periodName.trim();

    const [archetypes, hus, assetTypesRaw, assetTypeGroupsRaw] = await Promise.all([
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
      fetchAllRecords(client, 'asset_type_configs', 'id,name,group_id,is_active'),
      fetchAllRecords(client, 'asset_type_groups', 'id,name'),
    ]);
    const meta = await loadFsUpdateMetaFromDb(client, pn, hus, archetypes, scopeFilter);

    const filterOptions = buildScopedFsFilterOptions(hus, archetypes, scopeFilter);

    return {
      periodName,
      masterData: {
        archetypes,
        hus,
        assetTypes: assetTypesRaw ? assetTypesRaw.map(toCamelCase) : [],
        assetTypeGroups: assetTypeGroupsRaw ? assetTypeGroupsRaw.map(toCamelCase) : [],
      },
      fsByProjectId: {},
      assetFSApprovalMap: {},
      filterOptions,
      summary: meta.summary,
      summaryCounts: meta.summaryCounts,
    };
  }

  async loadQueryPage(accessToken: string, body: unknown) {
    const query = parseFsUpdateQuery(body);
    await this.authZ.assertHierarchyPermission(accessToken, query.userId, 'FS Update', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, query.userId);

    const [archetypes, hus, tasks] = await Promise.all([
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
      getAllTasks(client),
    ]);
    const pageWithMaster = await loadFsUpdateProjectsPage(client, query, hus, archetypes);
    const projectIds = pageWithMaster.projects.map((p) => String(p.id));

    let studies: any[] = [];
    let assets: any[] = [];
    let assetTaskStatuses: any[] = [];

    if (projectIds.length > 0) {
      const [studyRows, assetRows] = await Promise.all([
        this.fetchStudiesByProjectIds(client, projectIds),
        fetchRecordsInBatches(client, 'assets', 'project_id', projectIds, FS_ASSET_SELECT),
      ]);
      studies = studyRows;
      assets = assetRows ?? [];
      const assetIds = assets.map((a) => String((a as { id?: string }).id ?? '')).filter(Boolean);
      if (assetIds.length > 0) {
        assetTaskStatuses =
          (await fetchRecordsByAssetIds(client, 'asset_task_statuses', assetIds)) ?? [];
      }
    }

    const rows = enrichFsUpdateProjectPage({
      projects: pageWithMaster.projects,
      masterHus: hus,
      masterArchetypes: archetypes,
      studies: studies.map((s) => toCamelCase(s)),
      assets: assets.map((a) => toCamelCase(a)),
      assetTaskStatuses: assetTaskStatuses.map((s) => toCamelCase(s)),
      tasks,
      sortBy: query.sortBy,
    });

    const filterOptions = buildScopedFsFilterOptions(hus, archetypes, query.scopeFilter);

    return {
      ...buildFsQueryPageFromDb(
        query.periodName,
        rows,
        pageWithMaster.page,
        pageWithMaster.pageSize,
        pageWithMaster.total,
        filterOptions,
      ),
      masterData: null,
      fsByProjectId: null,
    };
  }

  async findProject(accessToken: string, body: unknown) {
    const { userId, periodName, projectCode } = parseFsUpdateFindProjectBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const pn = periodName.trim();
    const code = projectCode.trim();

    const { data, error } = await client
      .from('projects')
      .select(FS_PROJECT_SELECT)
      .eq('period_name', pn)
      .ilike('project_code', code)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) {
      throw new BadRequestException(`Project not found for code: ${projectCode}`);
    }

    const [archetypes, hus, tasks, studies, assets] = await Promise.all([
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
      getAllTasks(client),
      this.fetchStudiesByProjectIds(client, [String(data.id)]),
      fetchRecordsInBatches(client, 'assets', 'project_id', [String(data.id)], FS_ASSET_SELECT),
    ]);
    const assetIds = (assets ?? []).map((a) => String((a as { id?: string }).id ?? '')).filter(Boolean);
    const assetTaskStatuses =
      assetIds.length > 0
        ? ((await fetchRecordsByAssetIds(client, 'asset_task_statuses', assetIds)) ?? [])
        : [];

    const [project] = enrichFsUpdateProjectPage({
      projects: [data as Record<string, unknown>],
      masterHus: hus,
      masterArchetypes: archetypes,
      studies: studies.map((s) => toCamelCase(s)),
      assets: (assets ?? []).map((a) => toCamelCase(a)),
      assetTaskStatuses: assetTaskStatuses.map((s) => toCamelCase(s)),
      tasks,
    });

    return { project };
  }

  async saveProjects(accessToken: string, body: unknown) {
    const b = (body ?? {}) as {
      userId?: number;
      periodName?: string;
      projects?: FsProjectPatch[];
    };
    const userId = this.parseUserId(b);
    const patches = Array.isArray(b.projects) ? b.projects : [];
    if (patches.length === 0) {
      return { ok: true, updated: 0 };
    }

    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'update');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    await this.patchFsFieldsOnly(client, patches);

    const periodName = typeof b.periodName === 'string' ? b.periodName.trim() : '';
    if (periodName) {
      await invalidateFsScreenCaches(this.cacheAside, userId);
    }

    return { ok: true, updated: patches.length };
  }

  private async patchFsFieldsOnly(client: SupabaseClient, patches: FsProjectPatch[]): Promise<void> {
    for (let i = 0; i < patches.length; i += FS_FIELDS_UPDATE_CONCURRENCY) {
      const chunk = patches.slice(i, i + FS_FIELDS_UPDATE_CONCURRENCY);
      await Promise.all(
        chunk.map(async (patch) => {
          const projectId = String(patch.id ?? '').trim();
          if (!projectId) {
            throw new BadRequestException('Each project patch requires id');
          }

          const update = buildFsProjectPatchUpdate(patch);
          if (Object.keys(update).length === 0) return;

          const { error } = await client.from('projects').update(update).eq('id', projectId);
          if (error) {
            throw new BadRequestException(`FS update ${projectId}: ${error.message}`);
          }
        }),
      );
    }
  }
}
