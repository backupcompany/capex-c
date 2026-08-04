import type { DashboardStats } from './types';

export const DASHBOARD_STALE_TIME_MS = 60_000;
export const DASHBOARD_GC_TIME_MS = 1000 * 60 * 60;
export const DASHBOARD_SNAPSHOT_PREFIX = 'dashboard';

/** Pie chart fills — pastel style with black stroke (matches dashboard chart reference). */
export const PROJECT_STATUS_CHART_COLORS = {
  onTrack: '#9FD4A9',
  atRisk: '#F7D794',
  offTrack: '#F5A9A9',
} as const;

const PROJECT_STATUS_COLOR_BY_NAME: Record<string, string> = {
  'On Track': PROJECT_STATUS_CHART_COLORS.onTrack,
  'At Risk': PROJECT_STATUS_CHART_COLORS.atRisk,
  'Off Track': PROJECT_STATUS_CHART_COLORS.offTrack,
};

/** FE owns chart colors — ignore stale hex from BE snapshot/cache. */
export function withProjectStatusChartColors<T extends { name: string; value: number; color: string }>(
  data: T[],
): T[] {
  return data.map((item) => ({
    ...item,
    color: PROJECT_STATUS_COLOR_BY_NAME[item.name] ?? item.color,
  }));
}

export const EMPTY_DASHBOARD_STATS: DashboardStats = {
  totalBudget: 0,
  totalConsumed: 0,
  projectCount: 0,
  projectStatusData: [
    { name: 'On Track', value: 0, color: PROJECT_STATUS_CHART_COLORS.onTrack },
    { name: 'At Risk', value: 0, color: PROJECT_STATUS_CHART_COLORS.atRisk },
    { name: 'Off Track', value: 0, color: PROJECT_STATUS_CHART_COLORS.offTrack },
  ],
  budgetByCategory: [],
  sankeyData: [],
};
