import type { ExecutiveDashboardChartsResponse, ExecutiveDashboardKpiResponse } from '@/services/executiveSummaryApi';

const FILTER_KEY = 'capex.executiveDashboard.filter.v1';
const DATA_PREFIX = 'capex.executiveDashboard.data.v1';

/** Match BE Redis dashboard TTL (5 min). */
export const EXECUTIVE_DASHBOARD_DISK_TTL_MS = 5 * 60 * 1000;

type FilterPayload = {
  periodName: string;
  userId: number;
  archetypeId: string | null;
};

type DataEnvelope = {
  savedAt: number;
  kpi: ExecutiveDashboardKpiResponse;
  charts: ExecutiveDashboardChartsResponse;
};

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

function isFresh(savedAt: number): boolean {
  return !!savedAt && Date.now() - savedAt <= EXECUTIVE_DASHBOARD_DISK_TTL_MS;
}

export function readExecutiveDashboardFilter(
  periodName: string,
  userId: number,
): { archetypeId: string | null } | null {
  const raw = storage()?.getItem(FILTER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FilterPayload;
    if (parsed.periodName !== periodName.trim() || parsed.userId !== userId) return null;
    return { archetypeId: parsed.archetypeId ?? null };
  } catch {
    return null;
  }
}

export function writeExecutiveDashboardFilter(
  periodName: string,
  userId: number,
  archetypeId: string | null,
): void {
  try {
    const payload: FilterPayload = {
      periodName: periodName.trim(),
      userId,
      archetypeId: archetypeId?.trim() || null,
    };
    storage()?.setItem(FILTER_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

function dataKey(periodName: string, userId: number, filtersKey: string): string {
  return `${DATA_PREFIX}:${userId}:${periodName.trim()}:${filtersKey}`;
}

export function readExecutiveDashboardDataCache(
  periodName: string,
  userId: number,
  filtersKey: string,
): DataEnvelope | null {
  const raw = storage()?.getItem(dataKey(periodName, userId, filtersKey));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DataEnvelope;
    if (!isFresh(parsed.savedAt) || !parsed.kpi || !parsed.charts) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeExecutiveDashboardDataCache(
  periodName: string,
  userId: number,
  filtersKey: string,
  kpi: ExecutiveDashboardKpiResponse,
  charts: ExecutiveDashboardChartsResponse,
): void {
  try {
    const envelope: DataEnvelope = { savedAt: Date.now(), kpi, charts };
    storage()?.setItem(dataKey(periodName, userId, filtersKey), JSON.stringify(envelope));
  } catch {
    /* quota */
  }
}
