import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { isDemoMode } from '../shared/demo-mode.util';
import { perfCacheDelete, perfCacheIncrement, perfCacheSet, perfCacheTtlMs } from '../shared/perf-cache';

const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOCKOUT_MS = 15 * 60 * 1000;

function lockoutConfig(): { maxFailures: number; windowMs: number; lockoutMs: number } {
  return {
    maxFailures: Math.max(3, Number(process.env.AUTH_LOCKOUT_MAX_FAILURES) || DEFAULT_MAX_FAILURES),
    windowMs: Math.max(60_000, Number(process.env.AUTH_LOCKOUT_WINDOW_MS) || DEFAULT_WINDOW_MS),
    lockoutMs: Math.max(60_000, Number(process.env.AUTH_LOCKOUT_MS) || DEFAULT_LOCKOUT_MS),
  };
}

function normalizeIdentifier(raw: string): string {
  return raw.trim().toLowerCase();
}

function failKey(identifier: string): string {
  return `auth:fail:${normalizeIdentifier(identifier)}`;
}

function lockKey(identifier: string): string {
  return `auth:lock:${normalizeIdentifier(identifier)}`;
}

/** Brute-force lockout after repeated failed login/exchange attempts. */
@Injectable()
export class AuthAccountLockoutService {
  private readonly memoryLockedUntil = new Map<string, number>();

  buildIdentifier(emailOrSubject: string, ip?: string | null): string {
    const id = normalizeIdentifier(emailOrSubject || 'unknown');
    const clientIp = (ip ?? 'unknown').trim() || 'unknown';
    return `${id}:${clientIp}`;
  }

  async assertNotLocked(identifier: string): Promise<void> {
    if (isDemoMode() || process.env.AUTH_LOCKOUT_DISABLED === '1') return;

    const key = lockKey(identifier);
    const memUntil = this.memoryLockedUntil.get(normalizeIdentifier(identifier));
    if (memUntil && memUntil > Date.now()) {
      throw this.lockedException(memUntil - Date.now());
    }

    const ttlMs = await perfCacheTtlMs(key);
    if (ttlMs !== null) {
      this.memoryLockedUntil.set(normalizeIdentifier(identifier), Date.now() + ttlMs);
      throw this.lockedException(ttlMs);
    }
    this.memoryLockedUntil.delete(normalizeIdentifier(identifier));
  }

  async recordFailure(identifier: string): Promise<void> {
    if (isDemoMode() || process.env.AUTH_LOCKOUT_DISABLED === '1') return;

    const { maxFailures, windowMs, lockoutMs } = lockoutConfig();
    const id = normalizeIdentifier(identifier);
    const count = await perfCacheIncrement(failKey(identifier), windowMs);

    if (count >= maxFailures) {
      await perfCacheSet(lockKey(identifier), { locked: true }, lockoutMs);
      this.memoryLockedUntil.set(id, Date.now() + lockoutMs);
    }
  }

  async clearFailures(identifier: string): Promise<void> {
    const id = normalizeIdentifier(identifier);
    await perfCacheDelete(failKey(identifier));
    await perfCacheDelete(lockKey(identifier));
    this.memoryLockedUntil.delete(id);
  }

  private lockedException(retryAfterMs: number): HttpException {
    const retrySec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return new HttpException(
      {
        message: 'Too many failed sign-in attempts. Try again later.',
        retryAfterSec: retrySec,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
