import type { Request, Response, NextFunction } from 'express';

const ALLOWED = new Set(['health', 'ready']);

/** Leaf service — po-update + gr-update routes + health (strangler fig). */
export function leafRouteAllowlistMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (ALLOWED.has(path)) return next();
    if (path === 'po-update' || path.startsWith('po-update/')) return next();
    if (path === 'gr-update' || path.startsWith('gr-update/')) return next();
    res.status(404).json({ message: 'Not found' });
  };
}
