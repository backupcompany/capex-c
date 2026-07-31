import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';

type ReqWithId = IncomingMessage & { requestId?: string };

/** Shared pino-http config for monolith + leaf services (Phase 14). */
export function leafPinoHttpOptions(): Options {
  return {
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    autoLogging: false,
    customProps: (req: ReqWithId) => ({
      requestId: req.requestId,
    }),
    customSuccessMessage: (req: ReqWithId, res: ServerResponse) =>
      `${req.method} ${req.url} ${res.statusCode} req=${req.requestId ?? '-'}`,
    customErrorMessage: (req: ReqWithId, res: ServerResponse, err: Error) =>
      `${req.method} ${req.url} ${res.statusCode} req=${req.requestId ?? '-'} err=${err.message}`,
  };
}
