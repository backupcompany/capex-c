import { Page } from '@/types';

/** Archetype/HU master tree — skip on Dashboard & table-only screens. */
const PERIOD_STRUCTURE_PAGES: ReadonlySet<Page> = new Set([
  Page.BudgetArchetype,
  Page.BudgetHU,
  Page.ExecutiveSummary,
]);

export function routeNeedsPeriodStructure(page: Page): boolean {
  return PERIOD_STRUCTURE_PAGES.has(page);
}

export const APP_SHELL_PAGES_WITH_FILTERS: Page[] = [
  Page.Dashboard,
  Page.BudgetPeriod,
  Page.BudgetArchetype,
  Page.BudgetHU,
  Page.FSUpdate,
  Page.FSApproval,
  Page.FSRealization,
  Page.DailyMOMSummary,
  Page.ExecutiveSummary,
  Page.BDDConstruction,
];
