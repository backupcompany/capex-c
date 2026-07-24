import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler/dist/throttler-storage.interface';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { perfCacheIncrement, perfCacheSet, perfCacheTtlMs } from './perf-cache';

/** Distributed throttler storage — Redis with in-memory fallback via perf-cache. */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private hitKey(key: string, throttlerName: string): string {
    return `throttle:hit:${throttlerName}:${key}`;
  }

  private blockKey(key: string, throttlerName: string): string {
    return `throttle:block:${throttlerName}:${key}`;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const ttlMs = Math.max(1_000, ttl);
    const blockMs = Math.max(1_000, blockDuration || ttlMs);
    const hitRedisKey = this.hitKey(key, throttlerName);
    const blockRedisKey = this.blockKey(key, throttlerName);

    const blockTtlMs = await perfCacheTtlMs(blockRedisKey);
    if (blockTtlMs !== null) {
      const hitTtlMs = (await perfCacheTtlMs(hitRedisKey)) ?? 0;
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil(hitTtlMs / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockTtlMs / 1000),
      };
    }

    const totalHits = await perfCacheIncrement(hitRedisKey, ttlMs);
    const timeToExpireMs = (await perfCacheTtlMs(hitRedisKey)) ?? ttlMs;

    if (totalHits > limit) {
      await perfCacheSet(blockRedisKey, { blocked: true }, blockMs);
      return {
        totalHits,
        timeToExpire: Math.ceil(timeToExpireMs / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockMs / 1000),
      };
    }

    return {
      totalHits,
      timeToExpire: Math.ceil(timeToExpireMs / 1000),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
