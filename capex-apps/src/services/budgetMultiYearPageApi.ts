import type { BudgetCategoryConfig, BudgetMultiYear, BudgetPeriod } from '@/types';
import { isCapexBeConfigured, postToCapexBe } from '@/lib/capexBeClient';
import { useBackendSession } from '@/lib/auth/authConstants';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { trackBackendFetch } from '@/lib/backendFetchTelemetry';

export type BudgetMultiYearPageBundle = {
  multiYears: BudgetMultiYear[];
  categories: BudgetCategoryConfig[];
  periodSummaries: BudgetPeriod[];
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeMultiYears(raw: unknown): BudgetMultiYear[] {
  if (!Array.isArray(raw)) return [];
  const out: BudgetMultiYear[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const budgetRaw = (o.budget ?? o) as Record<string, unknown>;
    const name = String(o.name ?? '').trim();
    const startYear = num(o.startYear ?? o.start_year);
    const endYear = num(o.endYear ?? o.end_year);
    if (!name) continue;
    out.push({
      name,
      startYear,
      endYear,
      budget: {
        budgetPlan: num(budgetRaw.budgetPlan ?? budgetRaw.budget_plan),
        budgetCarryForward: num(budgetRaw.budgetCarryForward ?? budgetRaw.budget_carry_forward),
        budgetAllocated: num(budgetRaw.budgetAllocated ?? budgetRaw.budget_allocated),
        approvedBudget: num(budgetRaw.approvedBudget ?? budgetRaw.approved_budget),
        consumedBudget: num(budgetRaw.consumedBudget ?? budgetRaw.consumed_budget),
        assetCount: num(budgetRaw.assetCount ?? budgetRaw.asset_count),
        noBudgetAssetCount: num(budgetRaw.noBudgetAssetCount ?? budgetRaw.no_budget_asset_count),
      },
    });
  }
  return out;
}

async function resolveAccessToken(): Promise<string | null> {
  if (useBackendSession() && typeof window !== 'undefined') {
    return null;
  }
  return getAccessTokenForBackend();
}

async function postBudgetMultiYear<T>(
  path: string,
  body: Record<string, unknown>,
  source: string,
): Promise<T | null> {
  if (!isCapexBeConfigured()) {
    trackBackendFetch(source, 'fallback', { reason: 'missing_base_url' });
    return null;
  }
  try {
    const token = await resolveAccessToken();
    const result = await postToCapexBe<T>(path, body, token);
    trackBackendFetch(source, 'success');
    return result;
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: number }).status)
        : Number.NaN;
    trackBackendFetch(source, 'fallback', {
      reason: 'http_error',
      ...(Number.isFinite(status) ? { httpStatus: status } : {}),
    });
    return null;
  }
}

export async function fetchBudgetMultiYearPageBundleFromBackend(
  userId: number,
): Promise<BudgetMultiYearPageBundle | null> {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return null;
  const result = await postBudgetMultiYear<Partial<BudgetMultiYearPageBundle>>(
    '/budget-multi-year/page-bundle',
    { userId: uid },
    'budgetMultiYear.pageBundle',
  );
  if (!result) return null;
  return {
    multiYears: normalizeMultiYears(result.multiYears),
    categories: Array.isArray(result.categories) ? result.categories : [],
    periodSummaries: Array.isArray(result.periodSummaries) ? result.periodSummaries : [],
  };
}

export async function fetchMultiYearPeriodBudgetsFromBackend(
  userId: number,
  multiYearName: string,
): Promise<{ periods: BudgetPeriod[]; categories: BudgetCategoryConfig[] } | null> {
  const uid = Number(userId);
  const name = multiYearName.trim();
  if (!Number.isFinite(uid) || !name) return null;
  const result = await postBudgetMultiYear<{ periods?: BudgetPeriod[]; categories?: BudgetCategoryConfig[] }>(
    '/budget-multi-year/period-budgets',
    { userId: uid, multiYearName: name },
    'budgetMultiYear.periodBudgets',
  );
  if (!result) return null;
  return {
    periods: Array.isArray(result.periods) ? result.periods : [],
    categories: Array.isArray(result.categories) ? result.categories : [],
  };
}

export async function saveMultiYearViaBackend(
  userId: number,
  multiYear: BudgetMultiYear,
): Promise<boolean> {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return false;
  const result = await postBudgetMultiYear<{ ok?: boolean }>(
    '/budget-multi-year/save-multi-year',
    { userId: uid, multiYear },
    'budgetMultiYear.saveMultiYear',
  );
  return result?.ok === true;
}

export async function createBudgetPeriodViaBackend(
  userId: number,
  periodName: string,
  startDate: string,
  endDate: string,
  multiYearName: string,
): Promise<boolean> {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return false;
  const result = await postBudgetMultiYear<{ ok?: boolean }>(
    '/budget-multi-year/create-period',
    {
      userId: uid,
      periodName: periodName.trim(),
      startDate,
      endDate,
      multiYearName: multiYearName.trim(),
    },
    'budgetMultiYear.createPeriod',
  );
  return result?.ok === true;
}

export async function savePeriodCategoryPlansViaBackend(
  userId: number,
  period: BudgetPeriod,
  categoryIds?: string[],
): Promise<boolean> {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return false;
  const result = await postBudgetMultiYear<{ ok?: boolean }>(
    '/budget-multi-year/save-period-plans',
    { userId: uid, period, ...(categoryIds?.length ? { categoryIds } : {}) },
    'budgetMultiYear.savePeriodPlans',
  );
  return result?.ok === true;
}

export type ArchetypeBudgetPlanRow = {
  archetypeId: string;
  categoryId: string;
  budgetPlan: number;
};

export async function saveArchetypeBudgetPlansViaBackend(
  userId: number,
  periodName: string,
  rows: ArchetypeBudgetPlanRow[],
): Promise<boolean> {
  const uid = Number(userId);
  const pn = periodName.trim();
  if (!Number.isFinite(uid) || !pn || !rows.length) return false;
  const result = await postBudgetMultiYear<{ ok?: boolean }>(
    '/budget-multi-year/save-archetype-plans',
    { userId: uid, periodName: pn, rows },
    'budgetMultiYear.saveArchetypePlans',
  );
  return result?.ok === true;
}

export type HuBudgetPlanRow = {
  hospitalUnitId: string;
  categoryId: string;
  budgetPlan: number;
};

export async function saveHuBudgetPlansViaBackend(
  userId: number,
  periodName: string,
  rows: HuBudgetPlanRow[],
): Promise<boolean> {
  const uid = Number(userId);
  const pn = periodName.trim();
  if (!Number.isFinite(uid) || !pn || !rows.length) return false;
  const result = await postBudgetMultiYear<{ ok?: boolean }>(
    '/budget-multi-year/save-hu-plans',
    { userId: uid, periodName: pn, rows },
    'budgetMultiYear.saveHuPlans',
  );
  return result?.ok === true;
}
