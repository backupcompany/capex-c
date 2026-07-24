import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { persistAssetRow } from '../budget-hu/budget-hu-persist.util';
import { CACHE_TTL_MS, cacheKeys } from '../shared/cache-keys';
import { CacheAsideService } from '../shared/cache-aside.service';
import { loadGrUpdatePageBundle } from './gr-update-page.loader';

type GrAssetPatch = {
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

const GR_PAGE_CACHE_TTL_MS = CACHE_TTL_MS.TABLE;

@Injectable()
export class GrUpdateService {
  constructor(
    private readonly authContext: AuthContextService,
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

  private async loadPageBundleCached(client: SupabaseClient, userId: number, periodName: string) {
    const cacheKey = cacheKeys.grUpdatePage(userId, periodName || 'all');
    return this.cacheAside.getOrLoad(cacheKey, GR_PAGE_CACHE_TTL_MS, () =>
      loadGrUpdatePageBundle(client, periodName),
    );
  }

  async loadPageBundle(accessToken: string, body: unknown) {
    const b = (body ?? {}) as { userId?: number; periodName?: string; skipCache?: boolean };
    const userId = this.parseUserId(b);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'GR Update', 'view');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const periodName = typeof b.periodName === 'string' ? b.periodName.trim() : '';

    if (b.skipCache) {
      await this.cacheAside.invalidate(cacheKeys.grUpdatePage(userId, periodName || 'all'));
    }

    return this.loadPageBundleCached(client, userId, periodName);
  }

  async saveAssets(accessToken: string, body: unknown) {
    const b = (body ?? {}) as { userId?: number; periodName?: string; assets?: GrAssetPatch[] };
    const userId = this.parseUserId(b);
    const patches = Array.isArray(b.assets) ? b.assets : [];
    if (patches.length === 0) {
      return { ok: true, updated: 0 };
    }

    await this.authZ.assertHierarchyPermission(accessToken, userId, 'GR Update', 'update');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    await this.patchAssets(client, patches);

    const periodName = typeof b.periodName === 'string' ? b.periodName.trim() : '';
    if (periodName) {
      await this.cacheAside.invalidate(cacheKeys.grUpdatePage(userId, periodName));
    }

    return { ok: true, updated: patches.length };
  }

  private async patchAssets(client: SupabaseClient, patches: GrAssetPatch[]): Promise<void> {
    for (const patch of patches) {
      const projectId = String(patch.projectId ?? '').trim();
      const assetId = String(patch.id ?? '').trim();
      if (!assetId || !projectId) {
        throw new BadRequestException('Each asset patch requires id and projectId');
      }
      const qty = Number(patch.qty ?? 1);
      const receivedQty = patch.receivedQty ?? (patch.isGoodsReceived ? qty : 0);
      await persistAssetRow(
        client,
        {
          id: assetId,
          projectId,
          poNumber: patch.poNumber ?? null,
          consumedBudget: patch.consumedBudget ?? 0,
          isGoodsReceived: patch.isGoodsReceived ?? false,
          receivedQty,
          qty,
          assetCode: patch.assetCode,
          assetName: patch.assetName,
          description: patch.description,
          budgetPlan: patch.budgetPlan,
          budgetAllocated: patch.budgetAllocated,
          workflowSetId: patch.workflowSetId,
          budgetCategoryId: patch.budgetCategoryId,
          endTargetDate: patch.endTargetDate,
          catalogueId: patch.catalogueId,
          bddPriority: patch.bddPriority,
          assetTypeId: patch.assetTypeId,
          lifecycleStatus: patch.lifecycleStatus,
        },
        projectId,
      );
    }
  }
}
