import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { clientIpFromRequest } from './ip-allowlist.util';

const LOCALHOST = new Set(['127.0.0.1', '::1', 'localhost']);

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

export function isLocalhostClientIp(req: Request): boolean {
  return LOCALHOST.has(normalizeIp(clientIpFromRequest(req)));
}

/** Restrict /metrics to localhost, METRICS_SECRET header, or explicit METRICS_PUBLIC=1 (dev). */
export function assertMetricsAccessAllowed(req: Request): void {
  if (process.env.METRICS_PUBLIC === '1') return;

  if (isLocalhostClientIp(req)) return;

  const secret = process.env.METRICS_SECRET?.trim();
  const token = req.headers['x-metrics-token'];
  if (secret && typeof token === 'string' && token === secret) return;

  throw new ForbiddenException('Forbidden');
}

/** Optional prod warning — metrics must not be wide open on the public internet. */
export function warnIfMetricsMisconfiguredInProduction(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.METRICS_PUBLIC === '1') {
    console.warn('[security] METRICS_PUBLIC=1 is set in production — disable immediately');
  }
  if (!process.env.METRICS_SECRET?.trim()) {
    console.warn(
      '[security] METRICS_SECRET unset — /metrics only reachable from localhost (set secret for remote scrape)',
    );
  }
}
