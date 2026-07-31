import type { Request, Response, NextFunction } from 'express';

const ALLOWED = new Set(['health', 'ready']);

/** Leaf service — only monitoring routes + health (strangler fig). */
export function leafRouteAllowlistMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (ALLOWED.has(path)) return next();
    if (path === 'monitoring' || path.startsWith('monitoring/')) return next();
    res.status(404).json({ message: 'Not found' });
  };
}
