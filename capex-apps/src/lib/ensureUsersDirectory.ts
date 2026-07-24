import type { QueryClient } from '@tanstack/react-query';
import type { AppBootstrapPayload } from '@/hooks/queries/fetchAppBootstrapData';
import { fetchUsersDirectoryFromBackend } from '@/services/appBootstrapApi';
import { writeCachedBootstrap } from '@/lib/appBootstrapCache';
import { queryKeys } from '@/lib/query-keys';
import type { User } from '@/types';

/** True when bootstrap is slim (self user only) but full directory can be loaded lazily. */
export function needsUsersDirectoryLoad(
  boot: AppBootstrapPayload | null | undefined,
  currentUsers: User[],
): boolean {
  if (!boot?.usersDirectoryAvailable) return false;
  return currentUsers.length <= 1;
}

/**
 * Load full user directory when bootstrap is slim — idempotent, coalesced via TanStack cache.
 */
export async function ensureUsersDirectoryLoaded(
  queryClient: QueryClient,
  userId: number,
  accessToken?: string | null,
): Promise<User[]> {
  const boot =
    queryClient.getQueryData<AppBootstrapPayload>(queryKeys.app.bootstrap) ?? null;
  if (!needsUsersDirectoryLoad(boot, boot?.users ?? [])) {
    return boot?.users ?? [];
  }

  const qk = queryKeys.app.usersDirectory(userId);
  const cached = queryClient.getQueryData<User[]>(qk);
  if (cached?.length) return cached;

  const users = await queryClient.fetchQuery({
    queryKey: qk,
    queryFn: async () => {
      const result = await fetchUsersDirectoryFromBackend(accessToken ?? null, userId);
      return result?.users ?? [];
    },
    staleTime: 5 * 60_000,
  });

  if (!users.length || !boot) return users.length ? users : (boot?.users ?? []);

  const nextBoot: AppBootstrapPayload = { ...boot, users };
  queryClient.setQueryData(queryKeys.app.bootstrap, nextBoot);
  writeCachedBootstrap(nextBoot);
  return users;
}
