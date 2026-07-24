import { BadRequestException } from '@nestjs/common';
import { parsePeriodUserBody } from './fs.dto';

export type FsScopeFilter = {
  archetypeNames: string[];
  huNames: string[];
};

export type FsApprovalSortOption =
  | 'projectName_asc'
  | 'paybackPeriod_asc'
  | 'paybackPeriod_desc'
  | 'amount_desc'
  | 'amount_asc';

export type FsRealizationSortOption =
  | 'projectName_asc'
  | 'huName_asc'
  | 'archetypeName_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'plannedRevenueStartDate_asc'
  | 'plannedRevenueStartDate_desc'
  | 'monthlyRevenuePlan_desc'
  | 'monthlyRevenuePlan_asc';

export type FsApprovalQuery = {
  userId: number;
  periodName: string;
  page: number;
  pageSize: number;
  search: string;
  archetypes: string[];
  hus: string[];
  categories: string[];
  paybackMin?: number;
  paybackMax?: number;
  sortBy: FsApprovalSortOption;
  scopeFilter: FsScopeFilter | null;
};

export type FsRealizationQuery = {
  userId: number;
  periodName: string;
  page: number;
  pageSize: number;
  search: string;
  archetypes: string[];
  hus: string[];
  sortBy: FsRealizationSortOption;
  scopeFilter: FsScopeFilter | null;
};

function parseStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? '').trim()).filter(Boolean);
}

function parseOptionalNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseScopeFilter(body: Record<string, unknown>): FsScopeFilter | null {
  const raw = body.scopeFilter;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const archetypeNames = parseStringArray(o.archetypeNames);
  const huNames = parseStringArray(o.huNames);
  if (archetypeNames.length === 0 && huNames.length === 0) return null;
  return { archetypeNames, huNames };
}

function parsePagination(body: Record<string, unknown>): { page: number; pageSize: number } {
  const page = Math.max(1, Math.floor(Number(body.page) || 1));
  const pageSize = Math.min(200, Math.max(10, Math.floor(Number(body.pageSize) || 20)));
  return { page, pageSize };
}

const APPROVAL_SORTS = new Set<FsApprovalSortOption>([
  'projectName_asc',
  'paybackPeriod_asc',
  'paybackPeriod_desc',
  'amount_desc',
  'amount_asc',
]);

const REALIZATION_SORTS = new Set<FsRealizationSortOption>([
  'projectName_asc',
  'huName_asc',
  'archetypeName_asc',
  'amount_desc',
  'amount_asc',
  'plannedRevenueStartDate_asc',
  'plannedRevenueStartDate_desc',
  'monthlyRevenuePlan_desc',
  'monthlyRevenuePlan_asc',
]);

export function parseFsApprovalQuery(body: unknown): FsApprovalQuery {
  const b = (body ?? {}) as Record<string, unknown>;
  const { userId, periodName } = parsePeriodUserBody(body);
  const { page, pageSize } = parsePagination(b);
  const sortRaw = String(b.sortBy ?? 'projectName_asc').trim() as FsApprovalSortOption;
  const sortBy = APPROVAL_SORTS.has(sortRaw) ? sortRaw : 'projectName_asc';

  return {
    userId,
    periodName,
    page,
    pageSize,
    search: String(b.search ?? '').trim(),
    archetypes: parseStringArray(b.archetypes),
    hus: parseStringArray(b.hus),
    categories: parseStringArray(b.categories),
    paybackMin: parseOptionalNumber(b.paybackMin),
    paybackMax: parseOptionalNumber(b.paybackMax),
    sortBy,
    scopeFilter: parseScopeFilter(b),
  };
}

export function parseFsRealizationQuery(body: unknown): FsRealizationQuery {
  const b = (body ?? {}) as Record<string, unknown>;
  const { userId, periodName } = parsePeriodUserBody(body);
  const { page, pageSize } = parsePagination(b);
  const sortRaw = String(b.sortBy ?? 'projectName_asc').trim() as FsRealizationSortOption;
  const sortBy = REALIZATION_SORTS.has(sortRaw) ? sortRaw : 'projectName_asc';

  return {
    userId,
    periodName,
    page,
    pageSize,
    search: String(b.search ?? '').trim(),
    archetypes: parseStringArray(b.archetypes),
    hus: parseStringArray(b.hus),
    sortBy,
    scopeFilter: parseScopeFilter(b),
  };
}

export type FsQueryFilterOptions = {
  archetypes: string[];
  hus: string[];
  categories?: string[];
};

export type FsQueryPageDto = {
  periodName: string;
  rows: unknown[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  filterOptions: FsQueryFilterOptions;
};

export function paginateRows<T>(rows: T[], page: number, pageSize: number): FsQueryPageDto['rows'] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function buildFsQueryPage<T>(
  periodName: string,
  allRows: T[],
  page: number,
  pageSize: number,
  filterOptions: FsQueryFilterOptions,
): FsQueryPageDto {
  const totalCount = allRows.length;
  const rows = paginateRows(allRows, page, pageSize);
  return {
    periodName,
    rows,
    page,
    pageSize,
    totalCount,
    hasMore: page * pageSize < totalCount,
    filterOptions,
  };
}

/** When rows are already paginated at DB level. */
export function buildFsQueryPageFromDb<T>(
  periodName: string,
  rows: T[],
  page: number,
  pageSize: number,
  totalCount: number,
  filterOptions: FsQueryFilterOptions,
): FsQueryPageDto {
  return {
    periodName,
    rows,
    page,
    pageSize,
    totalCount,
    hasMore: page * pageSize < totalCount,
    filterOptions,
  };
}

export function assertValidFsQuery(query: { periodName: string }): void {
  if (!query.periodName?.trim()) {
    throw new BadRequestException('periodName is required');
  }
}
