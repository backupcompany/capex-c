const BUDGET_THRESHOLD = 300_000_000;

export type PoStatusFilter = 'all' | 'hasPO' | 'noPO';
export type PoSortOption = 'assetName_asc' | 'projectName_asc' | 'consumedBudget_desc';

export type PoUpdateWindowFilters = {
  search?: string;
  poStatus?: PoStatusFilter;
  focusNeedingPO?: boolean;
  focusNotReceived?: boolean;
  hus?: string[];
  priorities?: string[];
  finishedTasks?: string[];
  budgetFilter?: 'low' | 'high' | null;
  completionMin?: number;
  completionMax?: number;
  archetype?: string | null;
  assetTypeGroup?: string | null;
  sortBy?: PoSortOption;
};

const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export function buildPoFilterHash(filters: PoUpdateWindowFilters): string {
  const payload = {
    s: filters.search?.trim().toLowerCase() ?? '',
    ps: filters.poStatus ?? 'noPO',
    fp: filters.focusNeedingPO ? 1 : 0,
    fr: filters.focusNotReceived ? 1 : 0,
    hu: [...(filters.hus ?? [])].map(normalize).sort().join('|'),
    pr: [...(filters.priorities ?? [])].map(normalize).sort().join('|'),
    ft: [...(filters.finishedTasks ?? [])].map(normalize).sort().join('|'),
    bf: filters.budgetFilter ?? '',
    cmin: filters.completionMin ?? 0,
    cmax: filters.completionMax ?? 100,
    ar: normalize(filters.archetype),
    atg: normalize(filters.assetTypeGroup),
    sort: filters.sortBy ?? 'assetName_asc',
  };
  return JSON.stringify(payload);
}

type PriorityRow = { id: string; name: string };

export function filterPoAssets(
  assets: any[],
  filters: PoUpdateWindowFilters,
  assetHasPOMap: Record<string, boolean>,
  assetLastTaskMap: Record<string, string>,
  priorities: PriorityRow[],
): any[] {
  const poStatus = filters.poStatus ?? 'noPO';
  let result = assets;

  if (poStatus === 'hasPO') {
    result = result.filter((asset) => assetHasPOMap[String(asset.id)] === true);
  } else if (poStatus === 'noPO') {
    result = result.filter((asset) => assetHasPOMap[String(asset.id)] !== true);
  }

  if (filters.focusNeedingPO) {
    result = result.filter(
      (asset) =>
        Number(asset.budgetPlan) > 0 && !String(asset.poNumber ?? '').trim(),
    );
  }
  if (filters.focusNotReceived) {
    result = result.filter(
      (asset) => String(asset.poNumber ?? '').trim() && !asset.isGoodsReceived,
    );
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
        String(asset.poNumber ?? '').toLowerCase().includes(lowerSearch) ||
        String(asset.cprId ?? '').toLowerCase().includes(lowerSearch) ||
        String(asset.poDate ?? '').toLowerCase().includes(lowerSearch)
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
      case 'consumedBudget_desc':
        return Number(b.consumedBudget) - Number(a.consumedBudget);
      default:
        return String(a.assetName ?? '').localeCompare(String(b.assetName ?? ''));
    }
  });
}

export function isPoWindowUnfiltered(filters: PoUpdateWindowFilters): boolean {
  const search = filters.search?.trim() ?? '';
  return (
    !search &&
    (filters.poStatus ?? 'noPO') === 'all' &&
    !filters.focusNeedingPO &&
    !filters.focusNotReceived &&
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

export function parsePoWindowFilters(raw: unknown): PoUpdateWindowFilters {
  const f = (raw ?? {}) as Record<string, unknown>;
  const poStatus = f.poStatus;
  const budgetFilter = f.budgetFilter;
  return {
    search: typeof f.search === 'string' ? f.search : '',
    poStatus:
      poStatus === 'all' || poStatus === 'hasPO' || poStatus === 'noPO' ? poStatus : 'noPO',
    focusNeedingPO: f.focusNeedingPO === true,
    focusNotReceived: f.focusNotReceived === true,
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
      f.sortBy === 'projectName_asc' || f.sortBy === 'consumedBudget_desc'
        ? f.sortBy
        : 'assetName_asc',
  };
}
