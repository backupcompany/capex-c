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
];

export function defaultBackendBase(): string {
  return (process.env.NEXT_PUBLIC_CAPEXBE_URL || process.env.CAPEXBE_URL || '')
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
