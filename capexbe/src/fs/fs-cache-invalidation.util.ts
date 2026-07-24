import type { CacheAsideService } from '../shared/cache-aside.service';

const fsScreenPrefixes = (userId: number) =>
  [
    `app:table:fs-update:page:${userId}:`,
    `app:table:fs-approval:page:${userId}:`,
    `app:table:fs-realization:page:${userId}:`,
  ] as const;

export async function invalidateFsScreenCaches(
  cacheAside: CacheAsideService,
  userId: number,
): Promise<void> {
  await Promise.all(fsScreenPrefixes(userId).map((prefix) => cacheAside.invalidateByPrefix(prefix)));
}
