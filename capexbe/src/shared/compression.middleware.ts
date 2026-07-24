import compression from 'compression';
import type { Request, Response } from 'express';

const THRESHOLD_BYTES = Math.max(256, Number(process.env.COMPRESSION_THRESHOLD) || 1024);

/** gzip JSON/HTML responses above threshold — skips SSE and pre-compressed payloads. */
export function createCompressionMiddleware() {
  return compression({
    threshold: THRESHOLD_BYTES,
    filter: (req: Request, res: Response) => {
      if (req.headers['x-no-compression']) return false;
      if (res.getHeader('Content-Encoding')) return false;
      const type = String(res.getHeader('Content-Type') || '');
      if (type.includes('text/event-stream')) return false;
      return compression.filter(req, res);
    },
  });
}
