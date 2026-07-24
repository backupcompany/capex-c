import type { NextFunction, Request, Response } from 'express';

const SLOW_MS = Math.max(100, Number(process.env.SLOW_REQUEST_MS) || 1_000);
const MAX_SLOW_SAMPLES = 25;
const MAX_ROUTE_STATS = 20;
const MAX_ROUTE_DURATIONS = 100;

type SlowSample = {
  method: string;
  path: string;
  status: number;
  ms: number;
  at: number;
};

type RouteStat = {
  route: string;
  count: number;
  avgMs: number;
  p95Ms: number;
  slowCount: number;
};

type RequestMetricsSnapshot = {
  uptimeSec: number;
  totalRequests: number;
  errorResponses: number;
  slowRequests: number;
  avgMs: number;
  p95Ms: number;
  slowThresholdMs: number;
  recentSlow: SlowSample[];
  topRoutes: RouteStat[];
};

type RouteAccumulator = {
  count: number;
  totalMs: number;
  slowCount: number;
  durations: number[];
};

const startedAt = Date.now();
let totalRequests = 0;
let errorResponses = 0;
let slowRequests = 0;
let totalMs = 0;
const recentSlow: SlowSample[] = [];
const recentDurations: number[] = [];
const routeStats = new Map<string, RouteAccumulator>();
const MAX_DURATION_SAMPLES = 500;

function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return Math.round(sorted[index]);
}

function recordRouteStat(route: string, ms: number, isSlow: boolean): void {
  let acc = routeStats.get(route);
  if (!acc) {
    acc = { count: 0, totalMs: 0, slowCount: 0, durations: [] };
    routeStats.set(route, acc);
  }
  acc.count += 1;
  acc.totalMs += ms;
  if (isSlow) acc.slowCount += 1;
  acc.durations.push(ms);
  if (acc.durations.length > MAX_ROUTE_DURATIONS) acc.durations.shift();
}

function buildTopRoutes(): RouteStat[] {
  return [...routeStats.entries()]
    .map(([route, acc]) => {
      const sorted = [...acc.durations].sort((a, b) => a - b);
      return {
        route,
        count: acc.count,
        avgMs: acc.count > 0 ? Math.round(acc.totalMs / acc.count) : 0,
        p95Ms: percentile(sorted, 0.95),
        slowCount: acc.slowCount,
      };
    })
    .sort((a, b) => b.p95Ms - a.p95Ms || b.count - a.count)
    .slice(0, MAX_ROUTE_STATS);
}

function recordRequest(method: string, path: string, status: number, ms: number): void {
  totalRequests += 1;
  totalMs += ms;
  recentDurations.push(ms);
  if (recentDurations.length > MAX_DURATION_SAMPLES) recentDurations.shift();

  const route = `${method} ${normalizePath(path)}`;
  const isSlow = ms >= SLOW_MS;
  recordRouteStat(route, ms, isSlow);

  if (status >= 500) errorResponses += 1;

  if (!isSlow) return;

  slowRequests += 1;
  recentSlow.push({
    method,
    path: normalizePath(path),
    status,
    ms: Math.round(ms),
    at: Date.now(),
  });
  if (recentSlow.length > MAX_SLOW_SAMPLES) recentSlow.shift();

  if (process.env.REQUEST_METRICS_LOG !== '0') {
    console.warn(`[slow-request] ${route} ${status} ${Math.round(ms)}ms`);
  }
}

export function getRequestMetricsSnapshot(): RequestMetricsSnapshot {
  const sorted = [...recentDurations].sort((a, b) => a - b);
  return {
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    totalRequests,
    errorResponses,
    slowRequests,
    avgMs: totalRequests > 0 ? Math.round(totalMs / totalRequests) : 0,
    p95Ms: percentile(sorted, 0.95),
    slowThresholdMs: SLOW_MS,
    recentSlow: [...recentSlow],
    topRoutes: buildTopRoutes(),
  };
}

/** Lightweight HTTP timing — no external APM dependency. */
export function requestMetricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      recordRequest(req.method, req.path || req.url, res.statusCode, ms);
    });
    next();
  };
}
