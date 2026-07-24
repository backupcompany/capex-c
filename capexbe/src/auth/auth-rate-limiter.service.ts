import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { isDemoMode } from '../shared/demo-mode.util';
import { perfCacheIncrement } from '../shared/perf-cache';

export type AuthRateLimitAction =
  | 'login'
  | 'exchange'
  | 'refresh'
  | 'heartbeat'
  | 'forgot_password';

const DEMO_LIMITS: Record<AuthRateLimitAction, { max: number; windowMs: number }> = {
  login: { max: 40, windowMs: 15 * 60 * 1000 },
  exchange: { max: 40, windowMs: 15 * 60 * 1000 },
  refresh: { max: 120, windowMs: 15 * 60 * 1000 },
  heartbeat: { max: 240, windowMs: 15 * 60 * 1000 },
  forgot_password: { max: 10, windowMs: 60 * 60 * 1000 },
};

const LIMITS: Record<AuthRateLimitAction, { max: number; windowMs: number }> = {
  login: { max: 8, windowMs: 15 * 60 * 1000 },
  exchange: { max: 20, windowMs: 15 * 60 * 1000 },
  refresh: { max: 60, windowMs: 15 * 60 * 1000 },
  heartbeat: { max: 120, windowMs: 15 * 60 * 1000 },
  forgot_password: { max: 2, windowMs: 60 * 60 * 1000 },
};

function limitsFor(action: AuthRateLimitAction): { max: number; windowMs: number } {
  return isDemoMode() ? DEMO_LIMITS[action] : LIMITS[action];
}

/** Redis-backed sliding-window rate limiter for auth endpoints (memory fallback). */
@Injectable()
export class AuthRateLimiterService {
  async assertAllowed(action: AuthRateLimitAction, key: string): Promise<void> {
    const { max, windowMs } = limitsFor(action);
    const bucketKey = `auth:rl:${action}:${key}`;
    const count = await perfCacheIncrement(bucketKey, windowMs);
    if (count > max) {
      throw new HttpException(
        'Too many requests. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
