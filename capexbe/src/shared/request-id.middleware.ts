import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

/** Propagate or generate correlation ID for structured logs and cross-service tracing. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = req.header(REQUEST_ID_HEADER)?.trim() || randomUUID();
  req.requestId = id;
  req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
