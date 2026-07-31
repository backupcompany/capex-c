'use client';

import { lazy, type ComponentType } from 'react';
import { Page } from '@/types';

type ScreenModule = { default: ComponentType<any> };
type ScreenLoader = () => Promise<ScreenModule>;

function lazyScreen(loader: ScreenLoader) {
  return lazy(loader);
}

/** Shared dynamic imports — used by React.lazy and hover/nav chunk prefetch. */
export const screenLoaders: Partial<Record<Page, ScreenLoader>> = {
  [Page.Dashboard]: () =>
    import('@/screens/DashboardPage').then((m) => ({ default: m.DashboardPage })),
  [Page.ExecutiveSummary]: () =>
    import('@/screens/ExecutiveSummaryPage').then((m) => ({ default: m.ExecutiveSummaryPage })),
  [Page.AIAnalytics]: () =>
    import('@/screens/AIAnalyticsPage').then((m) => ({ default: m.AIAnalyticsPage })),
  [Page.UserMonitoring]: () =>
    import('@/screens/UserMonitoringPage').then((m) => ({ default: m.UserMonitoringPage })),
  [Page.DataMigration]: () =>
    import('@/screens/DataMigrationPage').then((m) => ({ default: m.DataMigrationPage })),
  [Page.CapexProjectList]: () =>
    import('@/screens/CapexProjectListPage').then((m) => ({ default: m.CapexProjectListPage })),
  [Page.BDDConstruction]: () =>
    import('@/screens/BDDConstructionPage').then((m) => ({ default: m.BDDConstructionPage })),
  [Page.DailyMOMSummary]: () =>
    import('@/screens/MomDailySummaryPage').then((m) => ({ default: m.MomDailySummaryPage })),
  [Page.MyTask]: () =>
    import('@/screens/MyTaskPage').then((m) => ({ default: m.MyTaskPage })),
  [Page.BudgetMultiYear]: () =>
    import('@/screens/BudgetMultiYearPage').then((m) => ({ default: m.BudgetMultiYearPage })),
  [Page.BudgetPeriod]: () =>
    import('@/screens/BudgetSiloamPage').then((m) => ({ default: m.BudgetPeriodPage })),
  [Page.BudgetArchetype]: () =>
    import('@/screens/BudgetArchetypePage').then((m) => ({ default: m.BudgetArchetypePage })),
  [Page.BudgetHU]: () =>
    import('@/screens/BudgetHUPage').then((m) => ({ default: m.BudgetHUPage })),
  [Page.POUpdate]: () =>
    import('@/screens/POUpdatePage/POUpdatePage').then((m) => ({ default: m.POUpdatePage })),
  [Page.GRUpdate]: () =>
    import('@/screens/GRUpdatePage/GRUpdatePage').then((m) => ({ default: m.GRUpdatePage })),
  [Page.FSUpdate]: () =>
    import('@/screens/FSUpdatePage/FSUpdatePage').then((m) => ({ default: m.FSUpdatePage })),
  [Page.FSApproval]: () =>
    import('@/screens/FSApprovalPage/FSApprovalPage').then((m) => ({ default: m.FSApprovalPage })),
  [Page.FSRealization]: () =>
    import('@/screens/FSRealizationPage/FSRealizationPage').then((m) => ({
      default: m.FSRealizationPage,
    })),
  [Page.Configuration]: () =>
    import('@/screens/ConfigurationPage').then((m) => ({ default: m.ConfigurationPage })),
  [Page.Profile]: () =>
    import('@/screens/ProfilePage').then((m) => ({ default: m.ProfilePage })),
};

/** Warm the route JS chunk before click — biggest win for perceived navigation speed. */
export function prefetchScreenChunk(page: Page): void {
  const load = screenLoaders[page];
  if (!load) return;
  try {
    void load();
  } catch {
    /* best-effort */
  }
}

export const LazyDashboardPage = lazyScreen(screenLoaders[Page.Dashboard]!);
export const LazyExecutiveSummaryPage = lazyScreen(screenLoaders[Page.ExecutiveSummary]!);
export const LazyAIAnalyticsPage = lazyScreen(screenLoaders[Page.AIAnalytics]!);
export const LazyUserMonitoringPage = lazyScreen(screenLoaders[Page.UserMonitoring]!);
export const LazyDataMigrationPage = lazyScreen(screenLoaders[Page.DataMigration]!);
export const LazyCapexProjectListPage = lazyScreen(screenLoaders[Page.CapexProjectList]!);
export const LazyBDDConstructionPage = lazyScreen(screenLoaders[Page.BDDConstruction]!);
export const LazyMomDailySummaryPage = lazyScreen(screenLoaders[Page.DailyMOMSummary]!);
export const LazyMyTaskPage = lazyScreen(screenLoaders[Page.MyTask]!);
export const LazyBudgetMultiYearPage = lazyScreen(screenLoaders[Page.BudgetMultiYear]!);
export const LazyBudgetPeriodPage = lazyScreen(screenLoaders[Page.BudgetPeriod]!);
export const LazyBudgetArchetypePage = lazyScreen(screenLoaders[Page.BudgetArchetype]!);
export const LazyBudgetHUPage = lazyScreen(screenLoaders[Page.BudgetHU]!);
export const LazyPOUpdatePage = lazyScreen(screenLoaders[Page.POUpdate]!);
export const LazyGRUpdatePage = lazyScreen(screenLoaders[Page.GRUpdate]!);
export const LazyFSUpdatePage = lazyScreen(screenLoaders[Page.FSUpdate]!);
export const LazyFSApprovalPage = lazyScreen(screenLoaders[Page.FSApproval]!);
export const LazyFSRealizationPage = lazyScreen(screenLoaders[Page.FSRealization]!);
export const LazyConfigurationPage = lazyScreen(screenLoaders[Page.Configuration]!);
export const LazyProfilePage = lazyScreen(screenLoaders[Page.Profile]!);
export const LazyLoginPage = lazy(() =>
  import('@/screens/LoginPage').then((m) => ({ default: m.LoginPage })),
);

/** Pages loaded on demand — reduces initial App bundle parse cost. */
export const LAZY_SCREEN_PAGES: ReadonlySet<Page> = new Set(Object.values(Page));
