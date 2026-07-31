import type { Request, Response, NextFunction } from 'express';

const ALLOWED = new Set(['health', 'ready']);

const FS_PREFIXES = ['fs', 'fs-update', 'fs-approval', 'fs-realization'];

/** Leaf service — FS cluster routes + health (strangler fig). */
export function leafRouteAllowlistMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (ALLOWED.has(path)) return next();
    if (FS_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return next();
    res.status(404).json({ message: 'Not found' });
  };
}
