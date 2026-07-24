type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

export type PerfCacheEvent = 'hit' | 'miss' | 'set' | 'delete' | 'refresh' | 'error';

const memoryCache = new Map<string, CacheEntry>();
let redisClient: any | null = null;
let redisClientPromise: Promise<any | null> | null = null;
let redisHealthy = false;
/** After a failed connect, skip Redis until this timestamp (avoids ECONNREFUSED spam). */
let redisDisabledUntil = 0;
let lastRedisErrorLogAt = 0;

const REDIS_RETRY_MS = Number(process.env.REDIS_RETRY_MS) || 60_000;
const REDIS_CONNECT_MS = Number(process.env.REDIS_CONNECT_MS) || 800;
const REDIS_ERROR_LOG_COOLDOWN_MS = 30_000;

function shouldSkipRedis(): boolean {
  return Date.now() < redisDisabledUntil;
}

function logRedisErrorOnce(event: string, detail: string): void {
  const now = Date.now();
  if (now - lastRedisErrorLogAt < REDIS_ERROR_LOG_COOLDOWN_MS) return;
  lastRedisErrorLogAt = now;
  logCache('error', event, detail);
}

function safeCloseRedis(client: any | null): void {
  if (!client) return;
  try {
    client.removeAllListeners?.('error');
    client.removeAllListeners?.('ready');
    if (client.isOpen === true) {
      if (typeof client.destroy === 'function') {
        client.destroy();
      } else {
        const maybePromise = client.disconnect?.();
        if (maybePromise && typeof maybePromise.catch === 'function') {
          maybePromise.catch(() => {});
        }
      }
    }
  } catch {
    /* ignore — client may already be closed after failed connect */
  }
}

function markRedisUnavailable(reason: string, client?: any | null): void {
  redisDisabledUntil = Date.now() + REDIS_RETRY_MS;
  redisHealthy = false;
  const toClose = client ?? redisClient;
  redisClient = null;
  redisClientPromise = null;
  safeCloseRedis(toClose);
  logRedisErrorOnce('redis', reason);
}

function pruneMemoryCache(): void {
  const now = Date.now();
  for (const [k, v] of memoryCache.entries()) {
    if (v.expiresAt <= now) {
      memoryCache.delete(k);
    }
  }
}

function logCache(event: PerfCacheEvent, key: string, detail?: string): void {
  if (process.env.PERF_CACHE_LOG === '0') return;
  const msg = detail ? `[perf-cache] ${event} ${key} (${detail})` : `[perf-cache] ${event} ${key}`;
  if (event === 'error') {
    console.warn(msg);
  } else if (process.env.NODE_ENV !== 'production' || process.env.PERF_CACHE_LOG === '1') {
    console.debug(msg);
  }
}

async function connectRedis(): Promise<any | null> {
  if (shouldSkipRedis()) return null;
  if (redisClient && redisHealthy) return redisClient;
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;
  let client: any | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient } = require('redis');
    client = createClient({
      url: redisUrl,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: REDIS_CONNECT_MS,
        reconnectStrategy: () => false,
      },
    });
    client.on('error', (err: Error) => {
      redisHealthy = false;
      logRedisErrorOnce('redis', err.message);
    });
    client.on('ready', () => {
      redisHealthy = true;
      redisDisabledUntil = 0;
    });
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('redis connect timeout')), REDIS_CONNECT_MS),
      ),
    ]);
    redisClient = client;
    redisHealthy = true;
    redisDisabledUntil = 0;
    return client;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    safeCloseRedis(client);
    redisClient = null;
    redisClientPromise = null;
    redisHealthy = false;
    redisDisabledUntil = Date.now() + REDIS_RETRY_MS;
    logRedisErrorOnce('redis', msg);
    return null;
  }
}

async function getRedisClient(): Promise<any | null> {
  if (shouldSkipRedis()) return null;
  if (redisClient && redisHealthy) return redisClient;
  if (redisClientPromise) return redisClientPromise;
  redisClientPromise = connectRedis().finally(() => {
    if (!redisClient || !redisHealthy) redisClientPromise = null;
  });
  return redisClientPromise;
}

export async function perfCacheHealthCheck(): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) return false;
  try {
    await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('redis ping timeout')), 2_000),
      ),
    ]);
    redisHealthy = true;
    return true;
  } catch {
    redisHealthy = false;
    return false;
  }
}

export async function perfCacheGet<T>(key: string): Promise<T | null> {
  pruneMemoryCache();
  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now()) {
    logCache('hit', key, 'memory');
    return mem.value as T;
  }

  const redis = await getRedisClient();
  if (!redis) {
    logCache('miss', key, 'no-redis');
    return null;
  }
  try {
    const raw = await redis.get(key);
    if (!raw) {
      logCache('miss', key, 'redis');
      return null;
    }
    const parsed = JSON.parse(raw) as T;
    memoryCache.set(key, { expiresAt: Date.now() + 60_000, value: parsed });
    logCache('hit', key, 'redis');
    return parsed;
  } catch (err) {
    logCache('error', key, err instanceof Error ? err.message : 'get');
    return null;
  }
}

export async function perfCacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  const expiresAt = Date.now() + ttlMs;
  memoryCache.set(key, { expiresAt, value });
  logCache('set', key, `${Math.floor(ttlMs / 1000)}s`);

  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const ttlSec = Math.max(1, Math.floor(ttlMs / 1000));
    await redis.set(key, JSON.stringify(value), { EX: ttlSec });
  } catch (err) {
    logCache('error', key, err instanceof Error ? err.message : 'set');
  }
}

export async function perfCacheDelete(key: string): Promise<void> {
  memoryCache.delete(key);
  logCache('delete', key);
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    logCache('error', key, err instanceof Error ? err.message : 'del');
  }
}

/** Invalidate keys matching a Redis glob pattern (e.g. app:table:budget-hu:page:*:2026*). */
export async function perfCacheDeleteByPattern(pattern: string): Promise<void> {
  const re = globToRegExp(pattern);
  for (const key of [...memoryCache.keys()]) {
    if (re.test(key)) memoryCache.delete(key);
  }
  logCache('delete', pattern, 'pattern');

  const redis = await getRedisClient();
  if (!redis) return;
  try {
    let cursor = 0;
    do {
      const reply = await redis.scan(cursor, { MATCH: pattern, COUNT: 200 });
      cursor = Number(reply.cursor);
      const keys: string[] = reply.keys || [];
      if (keys.length > 0) {
        await redis.del(keys);
      }
    } while (cursor !== 0);
  } catch (err) {
    logCache('error', pattern, err instanceof Error ? err.message : 'scan-pattern');
  }
}

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}$`);
}

/** Invalidate all keys sharing a prefix (memory + Redis SCAN). */
export async function perfCacheDeleteByPrefix(prefix: string): Promise<void> {
  await perfCacheDeleteByPattern(`${prefix}*`);
}

/** Wait for another worker to populate cache (stampede mitigation). */
export async function perfCacheWaitFor<T>(
  key: string,
  opts?: { attempts?: number; delayMs?: number },
): Promise<T | null> {
  const delayMs = opts?.delayMs ?? 250;
  const hasRedisUrl = Boolean(process.env.REDIS_URL?.trim());
  const attempts =
    !hasRedisUrl || shouldSkipRedis()
      ? Math.min(opts?.attempts ?? 40, 2)
      : (opts?.attempts ?? 40);
  for (let i = 0; i < attempts; i += 1) {
    const hit = await perfCacheGet<T>(key);
    if (hit !== null) return hit;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

export async function perfCacheAcquireLock(key: string, ttlMs = 45_000): Promise<boolean> {
  const lockKey = `${key}:__lock__`;
  const redis = await getRedisClient();
  if (!redis) return true;
  try {
    const result = await redis.set(lockKey, '1', { NX: true, EX: Math.max(5, Math.ceil(ttlMs / 1000)) });
    return result === 'OK';
  } catch (err) {
    logCache('error', lockKey, err instanceof Error ? err.message : 'lock');
    return true;
  }
}

export async function perfCacheReleaseLock(key: string): Promise<void> {
  await perfCacheDelete(`${key}:__lock__`);
}

/** Atomic increment with TTL — used for distributed rate limits / lockout counters. */
export async function perfCacheIncrement(key: string, windowMs: number): Promise<number> {
  const ttlMs = Math.max(1_000, windowMs);
  const mem = memoryIncr(key, ttlMs);
  const redis = await getRedisClient();
  if (!redis) return mem;

  try {
    const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, ttlSec);
    }
    return count;
  } catch (err) {
    logCache('error', key, err instanceof Error ? err.message : 'incr');
    return mem;
  }
}

/** Returns remaining TTL ms when key exists (lock detection). */
export async function perfCacheTtlMs(key: string): Promise<number | null> {
  const redis = await getRedisClient();
  if (!redis) {
    const mem = memoryCache.get(key);
    if (!mem) return null;
    const remaining = mem.expiresAt - Date.now();
    return remaining > 0 ? remaining : null;
  }
  try {
    const sec = await redis.ttl(key);
    if (sec <= 0) return null;
    return sec * 1000;
  } catch {
    return null;
  }
}

const incrMemory = new Map<string, CacheEntry>();

function memoryIncr(key: string, ttlMs: number): number {
  const now = Date.now();
  const entry = incrMemory.get(key);
  if (!entry || entry.expiresAt <= now) {
    incrMemory.set(key, { expiresAt: now + ttlMs, value: 1 });
    return 1;
  }
  const next = (Number(entry.value) || 0) + 1;
  entry.value = next;
  return next;
}

export async function perfCacheRefresh<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const value = await fetcher();
  await perfCacheSet(key, value, ttlMs);
  logCache('refresh', key);
  return value;
}
