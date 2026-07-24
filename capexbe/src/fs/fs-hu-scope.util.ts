import type { SupabaseClient } from '@supabase/supabase-js';
import type { FsScopeFilter } from './fs-query.dto';
import { sanitizePostgrestIdList, buildSafeOrIlikeFilter } from '../shared/postgrest-filter.util';

type HuMaster = { id: string; name: string; archetypeId?: string; archetype_id?: string };
type ArcheMaster = { id: string; name: string };

function huArchetypeId(hu: HuMaster): string {
  return String(hu.archetypeId ?? hu.archetype_id ?? '');
}

const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();

/** Resolve HU ids allowed by scope / archetype / named HU filters. null = no HU restriction. */
export function resolveFsAllowedHuIds(
  masterHus: HuMaster[],
  masterArchetypes: ArcheMaster[],
  opts: {
    hus?: string[];
    meetingArchetype?: string | null;
    scopeFilter?: FsScopeFilter | null;
  },
): string[] | null {
  let allowed: Set<string> | null = null;

  const intersect = (ids: string[]) => {
    const next = new Set(ids.filter(Boolean));
    if (allowed === null) {
      allowed = next;
      return;
    }
    allowed = new Set([...allowed].filter((id) => next.has(id)));
  };

  const scope = opts.scopeFilter;
  if (scope?.huNames?.length) {
    const names = new Set(scope.huNames.map(normalize));
    intersect(masterHus.filter((h) => names.has(normalize(h.name))).map((h) => String(h.id)));
  }
  if (scope?.archetypeNames?.length) {
    const archNames = new Set(scope.archetypeNames.map(normalize));
    const archIds = new Set(
      masterArchetypes.filter((a) => archNames.has(normalize(a.name))).map((a) => String(a.id)),
    );
    intersect(masterHus.filter((h) => archIds.has(huArchetypeId(h))).map((h) => String(h.id)));
  }

  const meeting = opts.meetingArchetype?.trim();
  if (meeting) {
    const arch = masterArchetypes.find((a) => normalize(a.name) === normalize(meeting));
    if (arch) {
      intersect(masterHus.filter((h) => huArchetypeId(h) === String(arch.id)).map((h) => String(h.id)));
    } else {
      intersect([]);
    }
  }

  if (opts.hus?.length) {
    const names = new Set(opts.hus.map(normalize));
    intersect(masterHus.filter((h) => names.has(normalize(h.name))).map((h) => String(h.id)));
  }

  return allowed === null ? null : [...allowed];
}

export function buildScopedFsFilterOptions(
  masterHus: HuMaster[],
  masterArchetypes: ArcheMaster[],
  scopeFilter: FsScopeFilter | null,
  includeCategories = false,
  categoryNames: string[] = [],
): { archetypes: string[]; hus: string[]; categories?: string[] } {
  const allowedHuIds = resolveFsAllowedHuIds(masterHus, masterArchetypes, { scopeFilter });
  const huSet =
    allowedHuIds === null
      ? new Set(masterHus.map((h) => h.name))
      : new Set(masterHus.filter((h) => allowedHuIds.includes(String(h.id))).map((h) => h.name));

  const archIds = new Set(
    masterHus.filter((h) => huSet.has(h.name)).map((h) => huArchetypeId(h)),
  );
  const archetypes = masterArchetypes
    .filter((a) => archIds.has(String(a.id)))
    .map((a) => a.name)
    .sort((a, b) => a.localeCompare(b));

  const hus = [...huSet].sort((a, b) => a.localeCompare(b));
  if (!includeCategories) return { archetypes, hus };
  return {
    archetypes,
    hus,
    categories: [...categoryNames].sort((a, b) => a.localeCompare(b)),
  };
}

/** Apply HU id restriction on a projects query builder. */
export function applyHuIdFilter<T extends { in: (col: string, vals: string[]) => T }>(
  query: T,
  allowedHuIds: string[] | null,
): T | 'empty' {
  if (allowedHuIds === null) return query;
  if (allowedHuIds.length === 0) return 'empty';
  const safe = sanitizePostgrestIdList(allowedHuIds);
  if (safe.length === 0) return 'empty';
  return query.in('hospital_unit_id', safe);
}

export function applyProjectSearchFilter<T extends { or: (expr: string) => T }>(
  query: T,
  search: string,
): T {
  const orFilter = buildSafeOrIlikeFilter(['project_code', 'project_name', 'ax_code'], search);
  return orFilter ? query.or(orFilter) : query;
}

export async function countProjectsForPeriod(
  client: SupabaseClient,
  periodName: string,
  allowedHuIds: string[] | null,
): Promise<number> {
  let q = client
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('period_name', periodName.trim());
  const filtered = applyHuIdFilter(q, allowedHuIds);
  if (filtered === 'empty') return 0;
  const { count, error } = await filtered;
  if (error) throw new Error(`projects(count): ${error.message}`);
  return typeof count === 'number' ? count : 0;
}

function applyScopedProjectHuFilter<T extends { in: (col: string, vals: string[]) => T }>(
  query: T,
  column: string,
  allowedHuIds: string[] | null,
): T | 'empty' {
  if (allowedHuIds === null) return query;
  if (allowedHuIds.length === 0) return 'empty';
  const safe = sanitizePostgrestIdList(allowedHuIds);
  if (safe.length === 0) return 'empty';
  return query.in(column, safe);
}

export async function countStudiesForPeriod(
  client: SupabaseClient,
  periodName: string,
  allowedHuIds: string[] | null,
): Promise<number> {
  let q = client
    .from('feasibility_studies')
    .select('id, projects!inner(period_name, hospital_unit_id)', { count: 'exact', head: true })
    .eq('projects.period_name', periodName.trim());
  const filtered = applyScopedProjectHuFilter(q, 'projects.hospital_unit_id', allowedHuIds);
  if (filtered === 'empty') return 0;
  const { count, error } = await filtered;
  if (error) throw new Error(`feasibility_studies(count): ${error.message}`);
  return typeof count === 'number' ? count : 0;
}

export async function countAssetsForPeriod(
  client: SupabaseClient,
  periodName: string,
  allowedHuIds: string[] | null,
): Promise<number> {
  let q = client
    .from('assets')
    .select('id, projects!inner(period_name, hospital_unit_id)', { count: 'exact', head: true })
    .eq('projects.period_name', periodName.trim());
  const filtered = applyScopedProjectHuFilter(q, 'projects.hospital_unit_id', allowedHuIds);
  if (filtered === 'empty') return 0;
  const { count, error } = await filtered;
  if (error) throw new Error(`assets(count): ${error.message}`);
  return typeof count === 'number' ? count : 0;
}
