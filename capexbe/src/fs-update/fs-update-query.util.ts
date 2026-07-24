import type { FsScopeFilter } from '../fs/fs-query.dto';
import { applyScopeFilter } from '../fs/fs-query.util';
import type { FsEnrichedProjectRow } from './fs-update-enrichment.util';
import type { FsUpdateQuery, FsUpdateSortOption } from './fs-update-query.dto';

const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();

function resolveFsApproval(project: FsEnrichedProjectRow): boolean {
  const axCode = String(project.axCode ?? '').trim();
  const approvedBudget = Number(project.approvedBudget) || 0;
  return axCode !== '' && approvedBudget > 0;
}

export function filterAndSortFsUpdateProjects(
  rows: FsEnrichedProjectRow[],
  query: FsUpdateQuery,
): FsEnrichedProjectRow[] {
  let result = applyScopeFilter(rows as any[], query.scopeFilter) as unknown as FsEnrichedProjectRow[];

  if (query.showOnlyNotFSApproved) {
    result = result.filter((project) => !resolveFsApproval(project));
  }

  if (query.focusNeedingApproval) {
    result = result.filter((project) => (Number(project.approvedBudget) || 0) === 0);
  }

  const lowercasedFilter = query.search.toLowerCase().trim();
  if (lowercasedFilter || query.meetingArchetype || query.hus.length > 0) {
    result = result.filter((project) => {
      if (
        query.meetingArchetype &&
        normalize(project.archetypeName) !== normalize(query.meetingArchetype)
      ) {
        return false;
      }
      if (
        query.hus.length > 0 &&
        !query.hus.some((hu) => normalize(hu) === normalize(project.huName))
      ) {
        return false;
      }
      if (lowercasedFilter) {
        const axCode = String(project.axCode ?? '').toLowerCase();
        const matches =
          project.projectName.toLowerCase().includes(lowercasedFilter) ||
          project.huName.toLowerCase().includes(lowercasedFilter) ||
          project.archetypeName.toLowerCase().includes(lowercasedFilter) ||
          String(project.projectCode ?? '').toLowerCase().includes(lowercasedFilter) ||
          axCode.includes(lowercasedFilter);
        if (!matches) return false;
      }
      return true;
    });
  }

  return sortFsUpdateProjects(result, query.sortBy);
}

function sortFsUpdateProjects(rows: FsEnrichedProjectRow[], sortBy: FsUpdateSortOption): FsEnrichedProjectRow[] {
  return [...rows].sort((a, b) => {
    switch (sortBy) {
      case 'projectCode_asc':
        return String(a.projectCode ?? '').localeCompare(String(b.projectCode ?? ''));
      case 'huName_asc':
        return a.huName.localeCompare(b.huName);
      case 'budgetPlan_desc':
        return (Number(b.budgetPlan) || 0) - (Number(a.budgetPlan) || 0);
      case 'projectName_asc':
      default:
        return a.projectName.localeCompare(b.projectName);
    }
  });
}

export function collectFsUpdateFilterOptions(rows: FsEnrichedProjectRow[]): {
  archetypes: string[];
  hus: string[];
} {
  const archetypes = new Set<string>();
  const hus = new Set<string>();
  for (const row of rows) {
    archetypes.add(row.archetypeName);
    hus.add(row.huName);
  }
  return {
    archetypes: [...archetypes].sort((a, b) => a.localeCompare(b)),
    hus: [...hus].sort((a, b) => a.localeCompare(b)),
  };
}

export function findFsUpdateProjectByCode(
  rows: FsEnrichedProjectRow[],
  projectCode: string,
): FsEnrichedProjectRow | null {
  const norm = normalize(projectCode);
  if (!norm) return null;
  return (
    rows.find((p) => normalize(p.projectCode) === norm) ??
    rows.find((p) => normalize(p.projectCode).replace(/\s+/g, '') === norm.replace(/\s+/g, '')) ??
    null
  );
}

export function applyScopeToFsUpdateRows(
  rows: FsEnrichedProjectRow[],
  scope: FsScopeFilter | null,
): FsEnrichedProjectRow[] {
  return applyScopeFilter(rows as any[], scope) as unknown as FsEnrichedProjectRow[];
}
