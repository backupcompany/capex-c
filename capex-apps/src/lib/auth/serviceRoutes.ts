/**
 * Strangler-fig microservice routing — optional per-prefix backend URLs.
 * When env is unset, all traffic stays on the default capexbe (zero prod impact).
 */

export type ServiceRoute = {
  /** Human label for docs / verify script */
  name: string;
  /** Matches BFF path after /api/be/ (e.g. audit/list-for-entity) */
  prefixes: string[];
  /** Server-only env var — full origin, no trailing slash */
  envVar: string;
};

/** Leaf domains safe to extract first (low coupling). Order: extract priority. */
export const EXTRACTABLE_SERVICE_ROUTES: ServiceRoute[] = [
  {
    name: 'notifications',
    prefixes: ['notifications', 'notifications/'],
    envVar: 'CAPEX_SERVICE_NOTIFICATIONS_URL',
  },
  {
    name: 'audit',
    prefixes: ['audit', 'audit/'],
    envVar: 'CAPEX_SERVICE_AUDIT_URL',
  },
  {
    name: 'backup',
    prefixes: ['backup', 'backup/'],
    envVar: 'CAPEX_SERVICE_BACKUP_URL',
  },
  {
    name: 'configuration',
    prefixes: ['configuration', 'configuration/'],
    envVar: 'CAPEX_SERVICE_CONFIGURATION_URL',
  },
  {
    name: 'mom-daily-summary',
    prefixes: ['mom-daily-summary', 'mom-daily-summary/'],
    envVar: 'CAPEX_SERVICE_MOM_DAILY_SUMMARY_URL',
  },
  {
    name: 'asset-timeline',
    prefixes: ['asset-timeline'],
    envVar: 'CAPEX_SERVICE_ASSET_TIMELINE_URL',
  },
  {
    name: 'duplicate-detection',
    prefixes: ['duplicate-detection', 'duplicate-detection/'],
    envVar: 'CAPEX_SERVICE_DUPLICATE_DETECTION_URL',
  },
  {
    name: 'user-admin',
    prefixes: ['user-admin', 'user-admin/'],
    envVar: 'CAPEX_SERVICE_USER_ADMIN_URL',
  },
  {
    name: 'procurement',
    prefixes: ['po-update', 'po-update/', 'gr-update', 'gr-update/'],
    envVar: 'CAPEX_SERVICE_PROCUREMENT_URL',
  },
  {
    name: 'fs',
    prefixes: ['fs', 'fs/', 'fs-update', 'fs-update/', 'fs-approval', 'fs-approval/', 'fs-realization', 'fs-realization/'],
    envVar: 'CAPEX_SERVICE_FS_URL',
  },
  {
    name: 'monitoring',
    prefixes: ['monitoring', 'monitoring/'],
    envVar: 'CAPEX_SERVICE_MONITORING_URL',
  },
  {
    name: 'reporting',
    prefixes: ['dashboard', 'dashboard/', 'budget-multi-year', 'budget-multi-year/'],
    envVar: 'CAPEX_SERVICE_REPORTING_URL',
  },
  {
    name: 'executive-summary',
    prefixes: ['executive-summary', 'executive-summary/'],
    envVar: 'CAPEX_SERVICE_EXECUTIVE_SUMMARY_URL',
  },
  {
    name: 'tasks',
    prefixes: ['my-tasks', 'my-tasks/', 'task-actions', 'task-actions/'],
    envVar: 'CAPEX_SERVICE_TASKS_URL',
  },
  {
    name: 'core',
    prefixes: ['bootstrap', 'bootstrap/', 'project-list', 'project-list/', 'budget-hu', 'budget-hu/'],
    envVar: 'CAPEX_SERVICE_CORE_URL',
  },
  {
    name: 'smart-migration',
    prefixes: ['smart-migration', 'smart-migration/'],
    envVar: 'CAPEX_SERVICE_SMART_MIGRATION_URL',
  },
];

/** Server prefers CAPEXBE_URL (docker internal); browser falls back to NEXT_PUBLIC (/api/be). */
export function defaultBackendBase(): string {
  return (process.env.CAPEXBE_URL || process.env.NEXT_PUBLIC_CAPEXBE_URL || '')
    .replace(/\/$/, '')
    .trim();
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '').trim();
}

function matchesPrefix(normalized: string, prefix: string): boolean {
  const base = prefix.replace(/\/+$/, '');
  if (!base) return false;
  return normalized === base || normalized.startsWith(`${base}/`);
}

/** Resolve backend origin for a BFF path segment (e.g. /audit/list-for-entity). */
export function resolveBackendBaseForPath(path: string): string {
  const normalized = normalizePath(path);
  for (const route of EXTRACTABLE_SERVICE_ROUTES) {
    const hit = route.prefixes.some((p) => matchesPrefix(normalized, p));
    if (!hit) continue;
    const override = process.env[route.envVar]?.trim().replace(/\/$/, '');
    if (override) return override;
    break;
  }
  return defaultBackendBase();
}

/** Which extractable service owns this path, if any. */
export function serviceRouteForPath(path: string): ServiceRoute | null {
  const normalized = normalizePath(path);
  for (const route of EXTRACTABLE_SERVICE_ROUTES) {
    if (route.prefixes.some((p) => matchesPrefix(normalized, p))) return route;
  }
  return null;
}

/** Active overrides (env set) — for logging / health checks. */
export function activeServiceRouteOverrides(): { name: string; url: string; envVar: string }[] {
  return EXTRACTABLE_SERVICE_ROUTES.flatMap((route) => {
    const url = process.env[route.envVar]?.trim().replace(/\/$/, '');
    return url ? [{ name: route.name, url, envVar: route.envVar }] : [];
  });
}
