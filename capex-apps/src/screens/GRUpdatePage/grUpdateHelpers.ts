import type { Asset, EnrichedAsset, ProjectPriorityConfig } from '../../types';
import { buildPoFilterMaps, normalize, type PoFilterMaps } from '../POUpdatePage/poUpdateHelpers';

export type GrSortOption = 'assetName_asc' | 'projectName_asc' | 'receivedQty_desc';
export type GrStatusFilter = 'all' | 'notReceived' | 'partiallyReceived' | 'fullyReceived';

export type GrUpdateWindowFilters = {
  search?: string;
  grStatus?: GrStatusFilter;
  hus?: string[];
  priorities?: string[];
  finishedTasks?: string[];
  budgetFilter?: 'low' | 'high' | null;
  completionMin?: number;
  completionMax?: number;
  archetype?: string | null;
  assetTypeGroup?: string | null;
  sortBy?: GrSortOption;
};

export function buildGrWindowFilters(input: {
  debouncedSearch: string;
  grStatusFilter: GrStatusFilter;
  selectedHUs: string[];
  selectedPriorities: string[];
  selectedFinishedTasks: string[];
  selectedBudgetFilter: string | null;
  completionRange: { min: number; max: number };
  meetingFilters: { archetype: string | null; assetTypeGroup: string | null };
  sortBy: GrSortOption;
}): GrUpdateWindowFilters {
  return {
    search: input.debouncedSearch.trim(),
    grStatus: input.grStatusFilter,
    hus: input.selectedHUs,
    priorities: input.selectedPriorities,
    finishedTasks: input.selectedFinishedTasks,
    budgetFilter:
      input.selectedBudgetFilter === 'low' || input.selectedBudgetFilter === 'high'
        ? input.selectedBudgetFilter
        : null,
    completionMin: input.completionRange.min,
    completionMax: input.completionRange.max,
    archetype: input.meetingFilters.archetype,
    assetTypeGroup: input.meetingFilters.assetTypeGroup,
    sortBy: input.sortBy,
  };
}

export function buildGrWindowFilterKey(filters: GrUpdateWindowFilters): string {
  return JSON.stringify({
    s: filters.search?.trim().toLowerCase() ?? '',
    gs: filters.grStatus ?? 'all',
    hu: [...(filters.hus ?? [])].map(normalize).sort().join('|'),
    pr: [...(filters.priorities ?? [])].map(normalize).sort().join('|'),
    ft: [...(filters.finishedTasks ?? [])].map(normalize).sort().join('|'),
    bf: filters.budgetFilter ?? '',
    cmin: filters.completionMin ?? 0,
    cmax: filters.completionMax ?? 100,
    ar: normalize(filters.archetype),
    atg: normalize(filters.assetTypeGroup),
    sort: filters.sortBy ?? 'assetName_asc',
  });
}

export { buildPoFilterMaps, normalize, type PoFilterMaps };

export function getGRNStatus(item: Asset): { text: string; color: string; bg: string } {
  const orderedQty = (item as Asset & { qty?: number }).qty || 1;
  const receivedQty = (item as Asset & { receivedQty?: number }).receivedQty || 0;

  if (receivedQty === 0) {
    return { text: 'Not Received', color: 'text-orange-600', bg: 'bg-orange-100' };
  }
  if (receivedQty === orderedQty) {
    return { text: 'Fully Received', color: 'text-green-600', bg: 'bg-green-100' };
  }
  return {
    text: `Partially Received (${receivedQty}/${orderedQty})`,
    color: 'text-yellow-600',
    bg: 'bg-yellow-100',
  };
}

export function filterAndSortGrAssets(
  data: EnrichedAsset[],
  options: {
    grStatusFilter: GrStatusFilter;
    debouncedSearch: string;
    selectedHUs: string[];
    selectedPriorities: string[];
    selectedFinishedTasks: string[];
    selectedBudgetFilter: string | null;
    completionRange: { min: number; max: number };
    sortBy: GrSortOption;
    meetingFilters: { archetype: string | null; assetTypeGroup: string | null };
    assetLastTaskMap: Map<string, string>;
    filterMaps: PoFilterMaps;
    priorities?: ProjectPriorityConfig[];
  },
): EnrichedAsset[] {
  let result = data;

  if (options.grStatusFilter === 'notReceived') {
    result = result.filter((asset) => ((asset as EnrichedAsset & { receivedQty?: number }).receivedQty || 0) === 0);
  } else if (options.grStatusFilter === 'fullyReceived') {
    result = result.filter((asset) => {
      const orderedQty = (asset as EnrichedAsset & { qty?: number }).qty || 1;
      const receivedQty = (asset as EnrichedAsset & { receivedQty?: number }).receivedQty || 0;
      return receivedQty === orderedQty && receivedQty > 0;
    });
  } else if (options.grStatusFilter === 'partiallyReceived') {
    result = result.filter((asset) => {
      const orderedQty = (asset as EnrichedAsset & { qty?: number }).qty || 1;
      const receivedQty = (asset as EnrichedAsset & { receivedQty?: number }).receivedQty || 0;
      return receivedQty > 0 && receivedQty < orderedQty;
    });
  }

  const { projectPriorityMap, projectBudgetMap } = options.filterMaps;
  const priorityIdToName = new Map(
    (options.priorities ?? []).map((p) => [String(p.id), p.name] as [string, string]),
  );
  const lowerSearch = options.debouncedSearch.toLowerCase().trim();
  const BUDGET_THRESHOLD = 300_000_000;

  result = result.filter((asset) => {
    if (
      options.meetingFilters.archetype &&
      normalize(asset.archetypeName) !== normalize(options.meetingFilters.archetype)
    ) {
      return false;
    }
    if (
      options.meetingFilters.assetTypeGroup &&
      normalize(asset.assetTypeGroupName) !== normalize(options.meetingFilters.assetTypeGroup)
    ) {
      return false;
    }
    if (
      options.selectedHUs.length > 0 &&
      !options.selectedHUs.some((hu) => normalize(hu) === normalize(asset.huName))
    ) {
      return false;
    }
    if (options.selectedBudgetFilter) {
      const approved = asset.projectApprovedBudget ?? 0;
      const plan = asset.projectBudgetPlan ?? 0;
      const projectBudget =
        approved > 0
          ? approved
          : plan > 0
            ? plan
            : projectBudgetMap.get(asset.projectId) || 0;
      if (options.selectedBudgetFilter === 'low' && projectBudget > BUDGET_THRESHOLD) return false;
      if (options.selectedBudgetFilter === 'high' && projectBudget <= BUDGET_THRESHOLD) return false;
    }
    if (options.selectedPriorities.length > 0) {
      const priorityName =
        priorityIdToName.get(String(asset.projectPriorityId ?? '')) ??
        projectPriorityMap.get(asset.projectId);
      if (!priorityName || !options.selectedPriorities.some((p) => normalize(p) === normalize(priorityName))) {
        return false;
      }
    }
    if (options.selectedFinishedTasks.length > 0) {
      const lastTask = options.assetLastTaskMap.get(asset.id);
      if (!lastTask || !options.selectedFinishedTasks.some((t) => normalize(t) === normalize(lastTask))) {
        return false;
      }
    }
    const completionRate = asset.budgetPlan > 0 ? (asset.consumedBudget / asset.budgetPlan) * 100 : 0;
    if (completionRate < options.completionRange.min || completionRate > options.completionRange.max) {
      return false;
    }
    if (
      lowerSearch &&
      !(
        asset.assetName.toLowerCase().includes(lowerSearch) ||
        asset.assetCode?.toLowerCase().includes(lowerSearch) ||
        asset.projectName.toLowerCase().includes(lowerSearch) ||
        asset.projectCode?.toLowerCase().includes(lowerSearch) ||
        asset.huName.toLowerCase().includes(lowerSearch) ||
        asset.archetypeName.toLowerCase().includes(lowerSearch) ||
        asset.poNumber?.toLowerCase().includes(lowerSearch)
      )
    ) {
      return false;
    }
    return true;
  });

  return [...result].sort((a, b) => {
    switch (options.sortBy) {
      case 'projectName_asc':
        return a.projectName.localeCompare(b.projectName);
      case 'receivedQty_desc': {
        const aQty = (a as EnrichedAsset & { receivedQty?: number }).receivedQty || 0;
        const bQty = (b as EnrichedAsset & { receivedQty?: number }).receivedQty || 0;
        return bQty - aQty;
      }
      default:
        return a.assetName.localeCompare(b.assetName);
    }
  });
}

export type GrAssetChange = Partial<EnrichedAsset> & {
  id: string;
  receivedQty?: number;
  isGoodsReceived?: boolean;
  qty?: number;
  __grnStatusChecked?: boolean;
};

export function collectGrAssetChanges(
  allAssets: EnrichedAsset[],
  editedData: EnrichedAsset[],
): Map<string, GrAssetChange> {
  const changedAssetMap = new Map<string, GrAssetChange>();

  editedData.forEach((editedAsset) => {
    const originalAsset = allAssets.find((a) => a.id === editedAsset.id);
    if (!originalAsset) return;

    const changes: GrAssetChange = { id: editedAsset.id };
    let hasChanges = false;

    const originalReceivedQty = (originalAsset as EnrichedAsset & { receivedQty?: number }).receivedQty ?? 0;
    const editedReceivedQty = (editedAsset as EnrichedAsset & { receivedQty?: number }).receivedQty ?? 0;
    const orderedQty = (editedAsset as EnrichedAsset & { qty?: number }).qty ?? 1;

    if (editedReceivedQty < 0 || editedReceivedQty > orderedQty) return;

    if (originalReceivedQty !== editedReceivedQty) {
      changes.receivedQty = editedReceivedQty;
      hasChanges = true;
    }

    const originalIsGoodsReceived = originalAsset.isGoodsReceived ?? false;
    const editedIsGoodsReceived = editedAsset.isGoodsReceived ?? false;
    if (originalIsGoodsReceived !== editedIsGoodsReceived) {
      changes.isGoodsReceived = editedIsGoodsReceived;
      hasChanges = true;
    }

    const originalGrnChecked = (originalAsset as EnrichedAsset & { __grnStatusChecked?: boolean }).__grnStatusChecked ?? false;
    const editedGrnChecked = (editedAsset as EnrichedAsset & { __grnStatusChecked?: boolean }).__grnStatusChecked ?? false;
    if (originalGrnChecked !== editedGrnChecked) {
      changes.__grnStatusChecked = editedGrnChecked;
      hasChanges = true;
    }

    if (hasChanges) {
      changes.qty = orderedQty;
      changedAssetMap.set(editedAsset.id, changes);
    }
  });

  return changedAssetMap;
}
