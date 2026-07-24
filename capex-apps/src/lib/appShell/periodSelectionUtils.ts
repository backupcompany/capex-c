import type { BudgetPeriod } from '@/types';

/** Periode beririsan dengan tahun kalender `year` (rentang tanggal dan/atau teks nama/multi-year). */
export function budgetPeriodOverlapsCalendarYear(period: BudgetPeriod, year: number): boolean {
  const y = String(year);
  const label = `${period.periodName} ${period.multiYearName}`.toLowerCase();
  if (label.includes(y)) return true;
  if (!period.startDate?.trim() || !period.endDate?.trim()) return false;
  const start = new Date(period.startDate);
  const end = new Date(period.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  return start <= yearEnd && end >= yearStart;
}

/**
 * Default filter periode = yang relevan dengan tahun kalender `year` (mis. 2026).
 * `preferredMultiYearName` hanya dipakai sebagai tie-break.
 */
export function pickDefaultBudgetPeriodNameForYear(
  periods: BudgetPeriod[],
  year: number,
  preferredMultiYearName: string | null = null,
): string {
  if (periods.length === 0) return '';
  let pool = periods.filter((p) => budgetPeriodOverlapsCalendarYear(p, year));
  if (pool.length === 0) {
    pool = periods.filter((p) => p.periodName.toLowerCase().includes(String(year)));
  }
  if (pool.length === 0) pool = periods;
  const y = String(year);
  const sorted = [...pool].sort((a, b) => {
    const aHit = a.periodName.toLowerCase().includes(y) ? 0 : 1;
    const bHit = b.periodName.toLowerCase().includes(y) ? 0 : 1;
    if (aHit !== bHit) return aHit - bHit;
    if (preferredMultiYearName) {
      const ap = a.multiYearName === preferredMultiYearName ? 0 : 1;
      const bp = b.multiYearName === preferredMultiYearName ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    const ta = a.startDate ? new Date(a.startDate).getTime() : 0;
    const tb = b.startDate ? new Date(b.startDate).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return a.periodName.localeCompare(b.periodName);
  });
  return sorted[0]?.periodName ?? '';
}
