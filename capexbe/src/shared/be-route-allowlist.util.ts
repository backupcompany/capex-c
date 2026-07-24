import type { NextFunction, Request, Response } from 'express';

/** Mirror of capex-apps/src/lib/auth/bePathAllowlist.ts — keep in sync via verify-be-route-allowlist.mjs */
export const BE_ROUTE_PREFIXES = [
  'audit/',
  'notifications/',
  'budget-hu/',
  'budget-multi-year/',
  'task-actions/',
  'configuration/',
  'user-admin/',
  'smart-migration/',
  'project-list',
  'project-list/',
  'po-update/',
  'my-tasks',
  'my-tasks/',
  'monitoring/',
  'mom-daily-summary/',
  'gr-update/',
  'fs/',
  'fs-update/',
  'fs-realization/',
  'fs-approval/',
  'executive-summary/',
  'duplicate-detection/',
  'dashboard/',
  'bootstrap',
  'asset-timeline',
  'backup/',
  'auth/',
] as const;

const OPEN_EXACT = new Set(['health', 'ready', 'metrics']);

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '').trim();
}

export function isAllowedBeRoutePath(path: string): boolean {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  if (OPEN_EXACT.has(normalized)) return true;
  if (normalized.includes('..') || normalized.includes('\\')) return false;

  let decoded = normalized;
  try {
    decoded = decodeURIComponent(normalized);
  } catch {
    return false;
  }
  if (decoded.includes('..') || decoded.includes('\\')) return false;

  return BE_ROUTE_PREFIXES.some((prefix) => {
    const base = prefix.replace(/\/+$/, '');
    if (normalized === base) return true;
    return normalized.startsWith(`${base}/`);
  });
}

/** Reject unmapped backend routes when BE is exposed directly (defense beyond BFF allowlist). */
export function beRouteAllowlistMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS') return next();
    const path = normalizePath(req.path || req.url.split('?')[0] || '');
    if (isAllowedBeRoutePath(path)) return next();
    res.status(404).json({ message: 'Not found' });
  };
}
