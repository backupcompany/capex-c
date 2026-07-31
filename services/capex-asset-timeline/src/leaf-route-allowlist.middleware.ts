import type { Request, Response, NextFunction } from 'express';

const ALLOWED = new Set(['health', 'ready']);

/** Leaf service — only asset-timeline route + health (strangler fig). */
export function leafRouteAllowlistMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (ALLOWED.has(path)) return next();
    if (path === 'asset-timeline') return next();
    res.status(404).json({ message: 'Not found' });
  };
}
