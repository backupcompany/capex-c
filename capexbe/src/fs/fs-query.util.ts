import type { EnrichedFsRow } from './fs-enrichment.loader';
import type {
  FsApprovalQuery,
  FsApprovalSortOption,
  FsQueryFilterOptions,
  FsRealizationQuery,
  FsRealizationSortOption,
  FsScopeFilter,
} from './fs-query.dto';

function parsePayback(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function matchesApprovalSearch(fs: EnrichedFsRow, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const numericOnly = /^\d+$/.test(q.trim());
  if (numericOnly) {
    const num = parseInt(q.trim(), 10);
    if (parsePayback(fs.paybackPeriod) === num) return true;
    if (fs.amount === num) return true;
    if (fs.npv === num) return true;
  }
  return (
    fs.projectName.toLowerCase().includes(lower) ||
    fs.huName.toLowerCase().includes(lower) ||
    fs.archetypeName.toLowerCase().includes(lower) ||
    fs.capexCategoryName.toLowerCase().includes(lower) ||
    String(fs.conclusion).toLowerCase().includes(lower) ||
    String(fs.paybackPeriod).includes(q.trim())
  );
}

function matchesRealizationSearch(fs: EnrichedFsRow, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    fs.projectName.toLowerCase().includes(lower) ||
    fs.huName.toLowerCase().includes(lower) ||
    fs.archetypeName.toLowerCase().includes(lower) ||
    fs.capexCategoryName.toLowerCase().includes(lower) ||
    String(fs.fsType || '').toLowerCase().includes(lower) ||
    (fs.plannedRevenueStartDate || '').toLowerCase().includes(lower) ||
    (fs.actualRevenueStartDate || '').toLowerCase().includes(lower)
  );
}

function matchesPaybackRange(fs: EnrichedFsRow, min?: number, max?: number): boolean {
  const payback = parsePayback(fs.paybackPeriod);
  if (min !== undefined && payback < min) return false;
  if (max !== undefined && payback > max) return false;
  return true;
}

export function applyScopeFilter(rows: EnrichedFsRow[], scope: FsScopeFilter | null): EnrichedFsRow[] {
  if (!scope) return rows;
  const archSet = new Set(scope.archetypeNames);
  const huSet = new Set(scope.huNames);
  if (archSet.size === 0 && huSet.size === 0) return rows;

  return rows.filter((row) => {
    const archOk = archSet.size === 0 || archSet.has(row.archetypeName);
    const huOk = huSet.size === 0 || huSet.has(row.huName);
    return archOk && huOk;
  });
}

function sortApprovalRows(rows: EnrichedFsRow[], sortBy: FsApprovalSortOption): EnrichedFsRow[] {
  return [...rows].sort((a, b) => {
    switch (sortBy) {
      case 'paybackPeriod_asc':
        return parsePayback(a.paybackPeriod) - parsePayback(b.paybackPeriod);
      case 'paybackPeriod_desc':
        return parsePayback(b.paybackPeriod) - parsePayback(a.paybackPeriod);
      case 'amount_desc':
        return (b.amount || 0) - (a.amount || 0);
      case 'amount_asc':
        return (a.amount || 0) - (b.amount || 0);
      case 'projectName_asc':
      default:
        return a.projectName.localeCompare(b.projectName);
    }
  });
}

function sortRealizationRows(rows: EnrichedFsRow[], sortBy: FsRealizationSortOption): EnrichedFsRow[] {
  return [...rows].sort((a, b) => {
    switch (sortBy) {
      case 'huName_asc':
        return a.huName.localeCompare(b.huName) || a.projectName.localeCompare(b.projectName);
      case 'archetypeName_asc':
        return (
          a.archetypeName.localeCompare(b.archetypeName) || a.projectName.localeCompare(b.projectName)
        );
      case 'amount_desc':
        return (b.amount || 0) - (a.amount || 0);
      case 'amount_asc':
        return (a.amount || 0) - (b.amount || 0);
      case 'plannedRevenueStartDate_desc':
        return (b.plannedRevenueStartDate || '').localeCompare(a.plannedRevenueStartDate || '');
      case 'plannedRevenueStartDate_asc':
        return (a.plannedRevenueStartDate || '').localeCompare(b.plannedRevenueStartDate || '');
      case 'monthlyRevenuePlan_desc':
        return (b.monthlyRevenuePlan || 0) - (a.monthlyRevenuePlan || 0);
      case 'monthlyRevenuePlan_asc':
        return (a.monthlyRevenuePlan || 0) - (b.monthlyRevenuePlan || 0);
      case 'projectName_asc':
      default:
        return a.projectName.localeCompare(b.projectName);
    }
  });
}

export function filterAndSortApprovalRows(
  items: EnrichedFsRow[],
  query: FsApprovalQuery,
): EnrichedFsRow[] {
  const q = query.search.trim();
  let result = applyScopeFilter(items, query.scopeFilter).filter((fs) => {
    if (query.archetypes.length > 0 && !query.archetypes.includes(fs.archetypeName)) return false;
    if (query.hus.length > 0 && !query.hus.includes(fs.huName)) return false;
    if (query.categories.length > 0 && !query.categories.includes(fs.capexCategoryName)) return false;
    if (!matchesPaybackRange(fs, query.paybackMin, query.paybackMax)) return false;
    if (!matchesApprovalSearch(fs, q)) return false;
    return true;
  });
  return sortApprovalRows(result, query.sortBy);
}

export function filterAndSortRealizationRows(
  items: EnrichedFsRow[],
  query: FsRealizationQuery,
): EnrichedFsRow[] {
  const q = query.search.trim();
  let result = applyScopeFilter(items, query.scopeFilter).filter((fs) => {
    if (query.archetypes.length > 0 && !query.archetypes.includes(fs.archetypeName)) return false;
    if (query.hus.length > 0 && !query.hus.includes(fs.huName)) return false;
    if (!matchesRealizationSearch(fs, q)) return false;
    return true;
  });
  return sortRealizationRows(result, query.sortBy);
}

export function collectApprovalFilterOptions(items: EnrichedFsRow[]): FsQueryFilterOptions {
  const archetypes = new Set<string>();
  const hus = new Set<string>();
  const categories = new Set<string>();
  for (const fs of items) {
    archetypes.add(fs.archetypeName);
    hus.add(fs.huName);
    categories.add(fs.capexCategoryName);
  }
  return {
    archetypes: [...archetypes].sort((a, b) => a.localeCompare(b)),
    hus: [...hus].sort((a, b) => a.localeCompare(b)),
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
  };
}

export function collectRealizationFilterOptions(items: EnrichedFsRow[]): FsQueryFilterOptions {
  const archetypes = new Set<string>();
  const hus = new Set<string>();
  for (const fs of items) {
    archetypes.add(fs.archetypeName);
    hus.add(fs.huName);
  }
  return {
    archetypes: [...archetypes].sort((a, b) => a.localeCompare(b)),
    hus: [...hus].sort((a, b) => a.localeCompare(b)),
  };
}
