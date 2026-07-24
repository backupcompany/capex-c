import type { SupabaseClient } from '@supabase/supabase-js';
import {
  countAssetsForPeriod,
  countProjectsForPeriod,
  countStudiesForPeriod,
  resolveFsAllowedHuIds,
} from '../fs/fs-hu-scope.util';
import { FS_UPDATE_META_STUDY_SELECT } from '../fs/fs-db.constants';
import type { FsScopeFilter } from '../fs/fs-query.dto';
import { sanitizePostgrestIdList } from '../shared/postgrest-filter.util';

const APPROVED_FS_STATUSES = new Set(['Approved', 'Approved with Notes']);
const META_STUDY_BATCH = 500;

type HuMaster = { id: string; name: string; archetypeId?: string; archetype_id?: string };
type ArcheMaster = { id: string; name: string };

type MetaStudyRow = {
  id: string;
  project_id: string;
  conclusion: string | null;
  amount: number | null;
  projects?: {
    approved_budget?: number | null;
    hospital_unit_id?: string | null;
  } | null;
};

export type FsUpdateMetaSummary = {
  submittedQty: number;
  submittedAmountIdr: number;
  approvedQty: number;
  approvedAmountIdr: number;
  notApprovedQty: number;
};

export type FsUpdateMetaCounts = {
  totalProjects: number;
  totalAssets: number;
  totalStudies: number;
};

function applyMetaHuFilter<T extends { in: (col: string, vals: string[]) => T }>(
  query: T,
  allowedHuIds: string[] | null,
): T | 'empty' {
  if (allowedHuIds === null) return query;
  if (allowedHuIds.length === 0) return 'empty';
  const safe = sanitizePostgrestIdList(allowedHuIds);
  if (safe.length === 0) return 'empty';
  return query.in('projects.hospital_unit_id', safe);
}

async function fetchMetaStudyRows(
  client: SupabaseClient,
  periodName: string,
  allowedHuIds: string[] | null,
): Promise<MetaStudyRow[]> {
  const pn = periodName.trim();
  const out: MetaStudyRow[] = [];
  let offset = 0;

  while (true) {
    let q = client
      .from('feasibility_studies')
      .select(FS_UPDATE_META_STUDY_SELECT)
      .eq('projects.period_name', pn)
      .range(offset, offset + META_STUDY_BATCH - 1);
    const filtered = applyMetaHuFilter(q, allowedHuIds);
    if (filtered === 'empty') return [];

    const { data, error } = await filtered;
    if (error) throw new Error(`feasibility_studies(meta): ${error.message}`);
    const batch = (data ?? []) as MetaStudyRow[];
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < META_STUDY_BATCH) break;
    offset += META_STUDY_BATCH;
  }

  return out;
}

export function computeFsUpdateSummaryFromStudies(studies: MetaStudyRow[]): FsUpdateMetaSummary {
  let submittedQty = 0;
  let submittedAmountIdr = 0;
  let approvedQty = 0;
  let approvedAmountIdr = 0;

  for (const row of studies) {
    submittedQty += 1;
    const approvedBudget = Number(row.projects?.approved_budget) || 0;
    const conclusion = String(row.conclusion ?? '');

    if (APPROVED_FS_STATUSES.has(conclusion)) {
      approvedQty += 1;
      approvedAmountIdr += approvedBudget;
    } else {
      submittedAmountIdr += approvedBudget;
    }
  }

  return {
    submittedQty,
    submittedAmountIdr,
    approvedQty,
    approvedAmountIdr,
    notApprovedQty: submittedQty - approvedQty,
  };
}

/** DB-level meta aggregates — no full period tree or asset enrichment. */
export async function loadFsUpdateMetaFromDb(
  client: SupabaseClient,
  periodName: string,
  masterHus: HuMaster[],
  masterArchetypes: ArcheMaster[],
  scopeFilter: FsScopeFilter | null,
): Promise<{ summary: FsUpdateMetaSummary; summaryCounts: FsUpdateMetaCounts }> {
  const pn = periodName.trim();
  const allowedHuIds = resolveFsAllowedHuIds(masterHus, masterArchetypes, { scopeFilter });

  const [studies, totalProjects, totalAssets, totalStudies] = await Promise.all([
    fetchMetaStudyRows(client, pn, allowedHuIds),
    countProjectsForPeriod(client, pn, allowedHuIds),
    countAssetsForPeriod(client, pn, allowedHuIds),
    countStudiesForPeriod(client, pn, allowedHuIds),
  ]);

  return {
    summary: computeFsUpdateSummaryFromStudies(studies),
    summaryCounts: { totalProjects, totalAssets, totalStudies },
  };
}
