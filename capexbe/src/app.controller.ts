import { Controller, Get, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from './auth/decorators/public.decorator';
import { assertMetricsAccessAllowed } from './shared/metrics-access.util';
import { perfCacheHealthCheck } from './shared/perf-cache';
import { getRequestMetricsSnapshot } from './shared/request-metrics';

@SkipThrottle()
@Controller()
export class AppController {
  @Public()
  @Get('health')
  async health() {
    const redisConfigured = Boolean(process.env.REDIS_URL?.trim());
    const redisOk = redisConfigured ? await perfCacheHealthCheck() : null;
    return {
      status: 'ok',
      ts: Date.now(),
      cache: {
        redis: redisConfigured ? (redisOk ? 'ok' : 'unreachable') : 'disabled',
      },
    };
  }

  @Public()
  @Get('ready')
  ready() {
    return { status: 'ready', ts: Date.now() };
  }

  /** Localhost, METRICS_SECRET header, or METRICS_PUBLIC=1 (dev) — not open to the internet. */
  @Public()
  @Get('metrics')
  metrics(@Req() req: Request) {
    assertMetricsAccessAllowed(req);
    return {
      status: 'ok',
      ts: Date.now(),
      http: getRequestMetricsSnapshot(),
    };
  }
}
