const BUDGET_THRESHOLD = 300_000_000;

export type GrStatusFilter = 'all' | 'notReceived' | 'partiallyReceived' | 'fullyReceived';
export type GrSortOption = 'assetName_asc' | 'projectName_asc' | 'receivedQty_desc';

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

const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export function buildGrFilterHash(filters: GrUpdateWindowFilters): string {
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

export function isGrWindowUnfiltered(filters: GrUpdateWindowFilters): boolean {
  const search = filters.search?.trim() ?? '';
  return (
    !search &&
    (filters.grStatus ?? 'all') === 'all' &&
    !(filters.hus?.length) &&
    !(filters.priorities?.length) &&
    !(filters.finishedTasks?.length) &&
    !filters.budgetFilter &&
    (filters.completionMin ?? 0) <= 0 &&
    (filters.completionMax ?? 100) >= 100 &&
    !filters.archetype &&
    !filters.assetTypeGroup
  );
}

export function filterGrAssets(
  assets: any[],
  filters: GrUpdateWindowFilters,
  assetLastTaskMap: Record<string, string>,
  priorities: { id: string; name: string }[],
): any[] {
  let result = assets;
  const grStatus = filters.grStatus ?? 'all';

  if (grStatus === 'notReceived') {
    result = result.filter((asset) => Number(asset.receivedQty ?? 0) === 0);
  } else if (grStatus === 'fullyReceived') {
    result = result.filter((asset) => {
      const orderedQty = Number(asset.qty ?? 1) || 1;
      const receivedQty = Number(asset.receivedQty ?? 0) || 0;
      return receivedQty === orderedQty && receivedQty > 0;
    });
  } else if (grStatus === 'partiallyReceived') {
    result = result.filter((asset) => {
      const orderedQty = Number(asset.qty ?? 1) || 1;
      const receivedQty = Number(asset.receivedQty ?? 0) || 0;
      return receivedQty > 0 && receivedQty < orderedQty;
    });
  }

  const priorityIdToName = new Map(priorities.map((p) => [String(p.id), p.name]));
  const lowerSearch = filters.search?.trim().toLowerCase() ?? '';
  const completionMin = filters.completionMin ?? 0;
  const completionMax = filters.completionMax ?? 100;

  result = result.filter((asset) => {
    if (filters.archetype && normalize(asset.archetypeName) !== normalize(filters.archetype)) {
      return false;
    }
    if (
      filters.assetTypeGroup &&
      normalize(asset.assetTypeGroupName) !== normalize(filters.assetTypeGroup)
    ) {
      return false;
    }
    if (
      filters.hus?.length &&
      !filters.hus.some((hu) => normalize(hu) === normalize(asset.huName))
    ) {
      return false;
    }
    if (filters.budgetFilter) {
      const approved = Number(asset.projectApprovedBudget) || 0;
      const plan = Number(asset.projectBudgetPlan) || 0;
      const projectBudget = approved > 0 ? approved : plan;
      if (filters.budgetFilter === 'low' && projectBudget > BUDGET_THRESHOLD) return false;
      if (filters.budgetFilter === 'high' && projectBudget <= BUDGET_THRESHOLD) return false;
    }
    if (filters.priorities?.length) {
      const priorityName = priorityIdToName.get(String(asset.projectPriorityId ?? ''));
      if (
        !priorityName ||
        !filters.priorities.some((p) => normalize(p) === normalize(priorityName))
      ) {
        return false;
      }
    }
    if (filters.finishedTasks?.length) {
      const lastTask = assetLastTaskMap[String(asset.id)];
      if (
        !lastTask ||
        !filters.finishedTasks.some((t) => normalize(t) === normalize(lastTask))
      ) {
        return false;
      }
    }
    const budgetPlan = Number(asset.budgetPlan) || 0;
    const consumed = Number(asset.consumedBudget) || 0;
    const completionRate = budgetPlan > 0 ? (consumed / budgetPlan) * 100 : 0;
    if (completionRate < completionMin || completionRate > completionMax) {
      return false;
    }
    if (
      lowerSearch &&
      !(
        String(asset.assetName ?? '').toLowerCase().includes(lowerSearch) ||
        String(asset.assetCode ?? '').toLowerCase().includes(lowerSearch) ||
        String(asset.projectName ?? '').toLowerCase().includes(lowerSearch) ||
        String(asset.projectCode ?? '').toLowerCase().includes(lowerSearch) ||
        String(asset.huName ?? '').toLowerCase().includes(lowerSearch) ||
        String(asset.archetypeName ?? '').toLowerCase().includes(lowerSearch) ||
        String(asset.poNumber ?? '').toLowerCase().includes(lowerSearch)
      )
    ) {
      return false;
    }
    return true;
  });

  const sortBy = filters.sortBy ?? 'assetName_asc';
  return [...result].sort((a, b) => {
    switch (sortBy) {
      case 'projectName_asc':
        return String(a.projectName ?? '').localeCompare(String(b.projectName ?? ''));
      case 'receivedQty_desc':
        return Number(b.receivedQty ?? 0) - Number(a.receivedQty ?? 0);
      default:
        return String(a.assetName ?? '').localeCompare(String(b.assetName ?? ''));
    }
  });
}

export function parseGrWindowFilters(raw: unknown): GrUpdateWindowFilters {
  const f = (raw ?? {}) as Record<string, unknown>;
  const grStatus = f.grStatus;
  const budgetFilter = f.budgetFilter;
  return {
    search: typeof f.search === 'string' ? f.search : '',
    grStatus:
      grStatus === 'all' ||
      grStatus === 'notReceived' ||
      grStatus === 'partiallyReceived' ||
      grStatus === 'fullyReceived'
        ? grStatus
        : 'all',
    hus: Array.isArray(f.hus) ? f.hus.map(String).filter(Boolean) : [],
    priorities: Array.isArray(f.priorities) ? f.priorities.map(String).filter(Boolean) : [],
    finishedTasks: Array.isArray(f.finishedTasks) ? f.finishedTasks.map(String).filter(Boolean) : [],
    budgetFilter: budgetFilter === 'low' || budgetFilter === 'high' ? budgetFilter : null,
    completionMin: Number.isFinite(Number(f.completionMin)) ? Number(f.completionMin) : 0,
    completionMax: Number.isFinite(Number(f.completionMax)) ? Number(f.completionMax) : 100,
    archetype: typeof f.archetype === 'string' && f.archetype.trim() ? f.archetype.trim() : null,
    assetTypeGroup:
      typeof f.assetTypeGroup === 'string' && f.assetTypeGroup.trim()
        ? f.assetTypeGroup.trim()
        : null,
    sortBy:
      f.sortBy === 'projectName_asc' || f.sortBy === 'receivedQty_desc'
        ? f.sortBy
        : 'assetName_asc',
  };
}
