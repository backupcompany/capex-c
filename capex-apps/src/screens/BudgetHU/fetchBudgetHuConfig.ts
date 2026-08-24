import type { AssetTypeConfig, BudgetCategoryConfig, ProjectPriorityConfig, WorkflowSet } from '@/types';
import * as configService from '@/services/configService';
import { fetchBudgetHuConfigFromBackend, type BudgetHuConfigBundle } from '@/services/budgetHuPageApi';
import { writeBudgetHuConfigCache } from '@/lib/budgetHuDiskCache';
import { invalidateRequestCache } from '@/lib/requestCache';

export type { BudgetHuConfigBundle };

/** Optional refresh of asset types / workflows; never block categories/priorities from Nest. */
async function overlayFreshHuMasterSlices(bundle: BudgetHuConfigBundle): Promise<BudgetHuConfigBundle> {
  try {
    invalidateRequestCache('cfg:asset_type');
    invalidateRequestCache('cfg:workflow');
    const [assetTypes, workflows] = await Promise.all([
      configService.getAllAssetTypeConfigs(),
      configService.getAllWorkflowSets(),
    ]);
    return {
      ...bundle,
      assetTypes: assetTypes.length ? assetTypes : bundle.assetTypes,
      workflows: workflows.length ? workflows : bundle.workflows,
    };
  } catch {
    return bundle;
  }
}

/** Master data for HU forms — Nest config-bundle first (categories/priorities). */
export async function fetchBudgetHuConfigBundle(userId: number): Promise<BudgetHuConfigBundle> {
  const cached = await fetchBudgetHuConfigFromBackend(userId);
  if (cached) {
    // Return Nest payload immediately-usable; overlay only enriches asset types/workflows.
    const result = await overlayFreshHuMasterSlices(cached);
    writeBudgetHuConfigCache(userId, result);
    return result;
  }

  const [config, categories, priorities, workflows, assetTypes] = await Promise.all([
    configService.getAppConfig('routineAssetMaxBudget'),
    configService.getAllBudgetCategories(),
    configService.getActiveProjectPriorities(),
    configService.getAllWorkflowSets(),
    configService.getAllAssetTypeConfigs(),
  ]);
  const result = {
    routineAssetMaxBudget: config?.value || 0,
    categories,
    priorities,
    workflows,
    assetTypes,
  };
  writeBudgetHuConfigCache(userId, result);
  return result;
}

export async function overlayFreshHuMasterOnPageBundle<
  T extends {
    assetTypes: AssetTypeConfig[];
    workflows: WorkflowSet[];
    categories?: BudgetCategoryConfig[];
    priorities?: ProjectPriorityConfig[];
  },
>(bundle: T): Promise<T> {
  try {
    const fresh = await overlayFreshHuMasterSlices({
      routineAssetMaxBudget: 0,
      categories: bundle.categories ?? [],
      priorities: bundle.priorities ?? [],
      workflows: bundle.workflows,
      assetTypes: bundle.assetTypes,
    });
    return {
      ...bundle,
      assetTypes: fresh.assetTypes,
      workflows: fresh.workflows,
    };
  } catch {
    return bundle;
  }
}
