import { BadRequestException } from '@nestjs/common';
import { parsePeriodUserBody } from '../fs/fs.dto';
import type { FsScopeFilter } from '../fs/fs-query.dto';

export type FsUpdateSortOption =
  | 'projectCode_asc'
  | 'projectName_asc'
  | 'huName_asc'
  | 'budgetPlan_desc';

export type FsUpdateQuery = {
  userId: number;
  periodName: string;
  page: number;
  pageSize: number;
  search: string;
  hus: string[];
  sortBy: FsUpdateSortOption;
  showOnlyNotFSApproved: boolean;
  focusNeedingApproval: boolean;
  meetingArchetype: string | null;
  scopeFilter: FsScopeFilter | null;
};

function parseStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? '').trim()).filter(Boolean);
}

function parseScopeFilter(body: Record<string, unknown>) {
  const raw = body.scopeFilter;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const archetypeNames = parseStringArray(o.archetypeNames);
  const huNames = parseStringArray(o.huNames);
  if (archetypeNames.length === 0 && huNames.length === 0) return null;
  return { archetypeNames, huNames };
}

function parsePagination(body: Record<string, unknown>) {
  const page = Math.max(1, Math.floor(Number(body.page) || 1));
  const pageSize = Math.min(200, Math.max(10, Math.floor(Number(body.pageSize) || 20)));
  return { page, pageSize };
}

const SORTS = new Set<FsUpdateSortOption>([
  'projectCode_asc',
  'projectName_asc',
  'huName_asc',
  'budgetPlan_desc',
]);

export function parseFsUpdateQuery(body: unknown): FsUpdateQuery {
  const b = (body ?? {}) as Record<string, unknown>;
  const { userId, periodName } = parsePeriodUserBody(body);
  const { page, pageSize } = parsePagination(b);
  const sortRaw = String(b.sortBy ?? 'projectName_asc').trim() as FsUpdateSortOption;
  const sortBy = SORTS.has(sortRaw) ? sortRaw : 'projectName_asc';
  const meetingArchetype =
    b.meetingArchetype != null && String(b.meetingArchetype).trim()
      ? String(b.meetingArchetype).trim()
      : null;

  return {
    userId,
    periodName,
    page,
    pageSize,
    search: String(b.search ?? '').trim(),
    hus: parseStringArray(b.hus),
    sortBy,
    showOnlyNotFSApproved: b.showOnlyNotFSApproved !== false,
    focusNeedingApproval: b.focusNeedingApproval === true,
    meetingArchetype,
    scopeFilter: parseScopeFilter(b),
  };
}

export function parseFsUpdateMetaBody(body: unknown): { userId: number; periodName: string; scopeFilter: FsScopeFilter | null } {
  const b = (body ?? {}) as Record<string, unknown>;
  const { userId, periodName } = parsePeriodUserBody(body);
  if (!periodName.trim()) throw new BadRequestException('periodName is required');
  return { userId, periodName, scopeFilter: parseScopeFilter(b) };
}

export function parseFsUpdateFindProjectBody(body: unknown): {
  userId: number;
  periodName: string;
  projectCode: string;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const { userId, periodName } = parsePeriodUserBody(body);
  const projectCode = String(b.projectCode ?? '').trim();
  if (!projectCode) throw new BadRequestException('projectCode is required');
  return { userId, periodName, projectCode };
}
