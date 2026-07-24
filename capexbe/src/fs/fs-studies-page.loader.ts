import type { SupabaseClient } from '@supabase/supabase-js';
import { toCamelCase } from '../project-list/supabase-helpers';
import { buildSafeOrIlikeFilter, sanitizePostgrestIdList } from '../shared/postgrest-filter.util';
import type { EnrichedFsRow } from './fs-enrichment.loader';
import { isNewRevenueGeneratingCategory } from './fs-enrichment.loader';
import { FS_APPROVAL_STUDY_PAGE_SELECT, FS_REALIZATION_STUDY_PAGE_SELECT } from './fs-db.constants';
import type { FsApprovalQuery, FsRealizationQuery } from './fs-query.dto';
import { resolveFsAllowedHuIds } from './fs-hu-scope.util';

const APPROVED_CONCLUSIONS = new Set(['Approved', 'Approved with Notes']);

type StudyPageRow = Record<string, unknown> & {
  projects?: {
    period_name?: string;
    project_name?: string;
    budget_category_id?: string;
    hospital_unit_id?: string;
    hospital_units_config?: {
      name?: string;
      archetype_id?: string;
      archetypes_config?: { name?: string } | { name?: string }[] | null;
    } | null;
  };
};

function huArchetypeFromProject(project: StudyPageRow['projects']): {
  huName: string;
  archetypeName: string;
} {
  const hu = project?.hospital_units_config;
  const archRaw = hu?.archetypes_config;
  const arch = Array.isArray(archRaw) ? archRaw[0] : archRaw;
  return {
    huName: String(hu?.name ?? ''),
    archetypeName: String(arch?.name ?? ''),
  };
}

function mapStudyRowToEnrichedFs(
  row: StudyPageRow,
  categoryMap: Map<string, string>,
): EnrichedFsRow {
  const camel = toCamelCase(row) as Record<string, unknown>;
  const project = row.projects;
  const { huName, archetypeName } = huArchetypeFromProject(project);
  const budgetCategoryId = String(project?.budget_category_id ?? '');

  return {
    id: String(camel.id),
    projectId: String(camel.projectId),
    fsType: String(camel.fsType ?? ''),
    amount: Number(camel.amount) || 0,
    irr: Number(camel.irr) || 0,
    paybackPeriod: Number(camel.paybackPeriod) || 0,
    npv: Number(camel.npv) || 0,
    roi: Number(camel.roi) || 0,
    plannedRevenueStartDate: String(camel.plannedRevenueStartDate ?? ''),
    actualRevenueStartDate: camel.actualRevenueStartDate as string | null | undefined,
    monthlyRevenuePlan: Number(camel.monthlyRevenuePlan) || 0,
    conclusion: String(camel.conclusion ?? ''),
    followUpAction: (camel.followUpAction as string | null | undefined) ?? null,
    createdAt: camel.createdAt as string | undefined,
    updatedAt: camel.updatedAt as string | undefined,
    archetypeName,
    huName,
    projectName: String(project?.project_name ?? ''),
    capexCategoryName: categoryMap.get(budgetCategoryId) || 'Unknown',
    budgetCategoryId,
  };
}

function applyStudyHuFilter<T extends { in: (col: string, vals: string[]) => T }>(
  query: T,
  allowedHuIds: string[] | null,
): T | 'empty' {
  if (allowedHuIds === null) return query;
  if (allowedHuIds.length === 0) return 'empty';
  const safe = sanitizePostgrestIdList(allowedHuIds);
  if (safe.length === 0) return 'empty';
  return query.in('projects.hospital_unit_id', safe);
}

function resolveHuIdsWithArchetypes(
  masterHus: Array<{ id: string; name: string; archetypeId?: string; archetype_id?: string }>,
  masterArchetypes: Array<{ id: string; name: string }>,
  query: { hus: string[]; archetypes: string[]; scopeFilter: FsApprovalQuery['scopeFilter'] },
): string[] | null {
  let allowedHuIds = resolveFsAllowedHuIds(masterHus, masterArchetypes, {
    hus: query.hus,
    scopeFilter: query.scopeFilter,
  });

  if (query.archetypes.length > 0) {
    const archNames = new Set(query.archetypes.map((a) => a.trim().toLowerCase()));
    const archIds = new Set(
      masterArchetypes
        .filter((a) => archNames.has(a.name.trim().toLowerCase()))
        .map((a) => String(a.id)),
    );
    const archHuIds = masterHus
      .filter((h) => archIds.has(String(h.archetypeId ?? h.archetype_id ?? '')))
      .map((h) => String(h.id));
    if (allowedHuIds === null) allowedHuIds = archHuIds;
    else allowedHuIds = allowedHuIds.filter((id) => archHuIds.includes(id));
  }

  return allowedHuIds;
}

export type FsStudiesPageResult = {
  rows: EnrichedFsRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function loadFsApprovalStudiesPage(
  client: SupabaseClient,
  query: FsApprovalQuery,
  masterHus: Array<{ id: string; name: string; archetypeId?: string; archetype_id?: string }>,
  masterArchetypes: Array<{ id: string; name: string }>,
  categories: Array<{ id: string; name: string }>,
): Promise<FsStudiesPageResult> {
  const pn = query.periodName.trim();
  const page = Math.max(1, Math.floor(query.page) || 1);
  const pageSize = Math.min(200, Math.max(10, Math.floor(query.pageSize) || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const categoryMap = new Map(categories.map((c) => [String(c.id), String(c.name)]));
  const categoryIds =
    query.categories.length > 0
      ? categories.filter((c) => query.categories.includes(c.name)).map((c) => String(c.id))
      : [];

  const allowedHuIds = resolveHuIdsWithArchetypes(masterHus, masterArchetypes, query);
  if (allowedHuIds !== null && allowedHuIds.length === 0) {
    return { rows: [], total: 0, page, pageSize };
  }
  if (query.categories.length > 0 && categoryIds.length === 0) {
    return { rows: [], total: 0, page, pageSize };
  }

  let q = client
    .from('feasibility_studies')
    .select(FS_APPROVAL_STUDY_PAGE_SELECT, { count: 'exact' })
    .eq('projects.period_name', pn);

  let withHu = applyStudyHuFilter(q, allowedHuIds);
  if (withHu === 'empty') return { rows: [], total: 0, page, pageSize };
  q = withHu;

  if (categoryIds.length > 0) {
    q = q.in('projects.budget_category_id', categoryIds);
  }
  if (query.paybackMin !== undefined) {
    q = q.gte('payback_period', query.paybackMin);
  }
  if (query.paybackMax !== undefined) {
    q = q.lte('payback_period', query.paybackMax);
  }

  const searchOr = buildSafeOrIlikeFilter(['conclusion', 'follow_up_action'], query.search);
  if (searchOr) q = q.or(searchOr);

  switch (query.sortBy) {
    case 'paybackPeriod_asc':
      q = q.order('payback_period', { ascending: true });
      break;
    case 'paybackPeriod_desc':
      q = q.order('payback_period', { ascending: false });
      break;
    case 'amount_desc':
      q = q.order('amount', { ascending: false });
      break;
    case 'amount_asc':
      q = q.order('amount', { ascending: true });
      break;
    default:
      q = q.order('project_id', { ascending: true });
  }

  const { data, error, count } = await q.range(from, to);
  if (error) throw new Error(`feasibility_studies(fs-approval-page): ${error.message}`);

  let rows = ((data ?? []) as StudyPageRow[]).map((row) => mapStudyRowToEnrichedFs(row, categoryMap));

  const search = query.search.trim().toLowerCase();
  if (search) {
    rows = rows.filter((fs) => {
      const numericOnly = /^\d+$/.test(search);
      if (numericOnly) {
        const num = parseInt(search, 10);
        if (fs.paybackPeriod === num || fs.amount === num || fs.npv === num) return true;
      }
      return (
        fs.projectName.toLowerCase().includes(search) ||
        fs.huName.toLowerCase().includes(search) ||
        fs.archetypeName.toLowerCase().includes(search) ||
        fs.capexCategoryName.toLowerCase().includes(search) ||
        String(fs.conclusion).toLowerCase().includes(search) ||
        String(fs.paybackPeriod).includes(search)
      );
    });
  }

  if (query.archetypes.length > 0) {
    const set = new Set(query.archetypes);
    rows = rows.filter((fs) => set.has(fs.archetypeName));
  }
  if (query.hus.length > 0) {
    const set = new Set(query.hus);
    rows = rows.filter((fs) => set.has(fs.huName));
  }

  return {
    rows,
    total: typeof count === 'number' ? count : rows.length,
    page,
    pageSize,
  };
}

export async function loadFsRealizationStudiesPage(
  client: SupabaseClient,
  query: FsRealizationQuery,
  masterHus: Array<{ id: string; name: string; archetypeId?: string; archetype_id?: string }>,
  masterArchetypes: Array<{ id: string; name: string }>,
  categories: Array<{ id: string; name: string }>,
): Promise<FsStudiesPageResult> {
  const pn = query.periodName.trim();
  const page = Math.max(1, Math.floor(query.page) || 1);
  const pageSize = Math.min(200, Math.max(10, Math.floor(query.pageSize) || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const categoryMap = new Map(categories.map((c) => [String(c.id), String(c.name)]));
  const allowedHuIds = resolveHuIdsWithArchetypes(masterHus, masterArchetypes, query);

  if (allowedHuIds !== null && allowedHuIds.length === 0) {
    return { rows: [], total: 0, page, pageSize };
  }

  let q = client
    .from('feasibility_studies')
    .select(FS_REALIZATION_STUDY_PAGE_SELECT, { count: 'exact' })
    .eq('projects.period_name', pn)
    .in('conclusion', ['Approved', 'Approved with Notes']);

  const withHu = applyStudyHuFilter(q, allowedHuIds);
  if (withHu === 'empty') return { rows: [], total: 0, page, pageSize };
  q = withHu;

  switch (query.sortBy) {
    case 'amount_desc':
      q = q.order('amount', { ascending: false });
      break;
    case 'amount_asc':
      q = q.order('amount', { ascending: true });
      break;
    case 'plannedRevenueStartDate_desc':
      q = q.order('planned_revenue_start_date', { ascending: false });
      break;
    case 'plannedRevenueStartDate_asc':
      q = q.order('planned_revenue_start_date', { ascending: true });
      break;
    case 'monthlyRevenuePlan_desc':
      q = q.order('monthly_revenue_plan', { ascending: false });
      break;
    case 'monthlyRevenuePlan_asc':
      q = q.order('monthly_revenue_plan', { ascending: true });
      break;
    default:
      q = q.order('project_id', { ascending: true });
  }

  const { data, error, count } = await q.range(from, to);
  if (error) throw new Error(`feasibility_studies(fs-realization-page): ${error.message}`);

  let rows = ((data ?? []) as StudyPageRow[]).map((row) => mapStudyRowToEnrichedFs(row, categoryMap));

  rows = rows.filter(
    (fs) =>
      APPROVED_CONCLUSIONS.has(String(fs.conclusion)) &&
      isNewRevenueGeneratingCategory(fs.capexCategoryName, fs.budgetCategoryId),
  );

  const search = query.search.trim().toLowerCase();
  if (search) {
    rows = rows.filter(
      (fs) =>
        fs.projectName.toLowerCase().includes(search) ||
        fs.huName.toLowerCase().includes(search) ||
        fs.archetypeName.toLowerCase().includes(search) ||
        fs.capexCategoryName.toLowerCase().includes(search) ||
        String(fs.fsType || '').toLowerCase().includes(search),
    );
  }

  if (query.archetypes.length > 0) {
    const set = new Set(query.archetypes);
    rows = rows.filter((fs) => set.has(fs.archetypeName));
  }
  if (query.hus.length > 0) {
    const set = new Set(query.hus);
    rows = rows.filter((fs) => set.has(fs.huName));
  }

  return {
    rows,
    total: typeof count === 'number' ? count : rows.length,
    page,
    pageSize,
  };
}
