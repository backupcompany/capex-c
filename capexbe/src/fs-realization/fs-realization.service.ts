import { Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthZService } from '../auth/auth-z.service';
import { FsAuthService } from '../fs/fs-auth.service';
import {
  enrichFsForPeriod,
  filterNrFeasibilityStudies,
  loadFsPeriodContext,
} from '../fs/fs-enrichment.loader';
import { buildScopedFsFilterOptions } from '../fs/fs-hu-scope.util';
import { loadFsRealizationStudiesPage } from '../fs/fs-studies-page.loader';
import { parsePeriodUserBody } from '../fs/fs.dto';
import {
  buildFsQueryPageFromDb,
  parseFsRealizationQuery,
  type FsQueryPageDto,
} from '../fs/fs-query.dto';
import {
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
} from '../project-list/master-data.loader';
import { fetchAllRecords } from '../project-list/supabase-helpers';
import { CACHE_TTL_MS, cacheKeys } from '../shared/cache-keys';
import { CacheAsideService } from '../shared/cache-aside.service';

const FS_PAGE_CACHE_TTL_MS = CACHE_TTL_MS.TABLE;

@Injectable()
export class FsRealizationService {
  constructor(
    private readonly fsAuth: FsAuthService,
    private readonly authZ: AuthZService,
    private readonly cacheAside: CacheAsideService,
  ) {}

  private async loadPageBundleUncached(client: SupabaseClient, periodName: string) {
    const { period, categories, studies } = await loadFsPeriodContext(client, periodName);
    const allFS = filterNrFeasibilityStudies(enrichFsForPeriod(period, studies, categories, true));
    return {
      periodName,
      allFS,
      categories,
      summary: {
        totalFs: studies.length,
        approvedFs: allFS.length,
      },
    };
  }

  private async loadPageBundleCached(client: SupabaseClient, userId: number, periodName: string) {
    const cacheKey = cacheKeys.fsRealizationPage(userId, periodName);
    return this.cacheAside.getOrLoad(cacheKey, FS_PAGE_CACHE_TTL_MS, () =>
      this.loadPageBundleUncached(client, periodName),
    );
  }

  async loadPageBundle(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Realization', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    return this.loadPageBundleCached(client, userId, periodName.trim());
  }

  async loadQueryPage(accessToken: string, body: unknown): Promise<FsQueryPageDto> {
    const query = parseFsRealizationQuery(body);
    await this.authZ.assertHierarchyPermission(accessToken, query.userId, 'FS Realization', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, query.userId);

    const [archetypes, hus, categoriesRaw] = await Promise.all([
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
      fetchAllRecords(client, 'budget_category_configs', 'id,name'),
    ]);

    const categories = (categoriesRaw ?? []).map((c) => ({
      id: String((c as { id: string }).id),
      name: String((c as { name: string }).name),
    }));

    const dbPage = await loadFsRealizationStudiesPage(client, query, hus, archetypes, categories);
    const filterOptions = buildScopedFsFilterOptions(hus, archetypes, query.scopeFilter);

    return buildFsQueryPageFromDb(
      query.periodName,
      dbPage.rows,
      dbPage.page,
      dbPage.pageSize,
      dbPage.total,
      filterOptions,
    );
  }
}
