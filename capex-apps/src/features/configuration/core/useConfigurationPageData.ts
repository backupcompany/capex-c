import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppBootstrapPayload } from '@/hooks/queries/fetchAppBootstrapData';
import { fetchConfigurationSlicesForUser } from '@/hooks/queries/fetchConfigurationSlices';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { queryKeys } from '@/lib/query-keys';
import {
  hydrateConfigurationFromDisk,
} from '@/lib/prefetchConfigurationPage';
import {
  hasMinimalConfigurationOnDisk,
  readConfigurationPackCacheAnyAge,
  writeConfigurationPackCache,
} from '@/lib/configurationDiskCache';
import {
  fetchFreshConfigurationSlices,
  type ConfigSliceKey,
  type ConfigurationDataPack,
} from '@/services/configurationApi';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { useBackendSession } from '@/lib/auth/authConstants';
import {
  buildSeedFromBootstrap,
  getMissingSlices,
  hasConfigurationSlice,
  INITIAL_CRITICAL_SLICES,
  isMinimalConfigurationReady,
  mergeConfigurationPack,
  TAB_REQUIRED_SLICES,
  TAB_REVALIDATE_ON_ACTIVE_SLICES,
  excludeUserManagedConfigurationSlices,
  toRenderableConfigurationPack,
  isUserManagedConfigurationSlice,
  type ConfigurationTab,
} from '@/features/configuration/core/configurationPageUtils';
import type { User, UserRole } from '@/types';
import { isShellCachePatchGuarded, readGuardedAuthBootstrapSlice } from '@/lib/syncAppShellCaches';
import { readCachedBootstrap } from '@/lib/appBootstrapCache';
import { invalidateRequestCache } from '@/lib/requestCache';
import { authzPackFingerprint } from '@/features/configuration/users-roles/utils/authzPackFingerprint';

const CONFIG_STALE_MS = 5 * 60 * 1000;
/** SA Configuration Users & Roles — peer UI sync only (read pack; no shell/user matrix push). */
const USERS_ROLES_PEER_POLL_MS = 4_000;

type UseConfigurationPageDataOptions = {
  userId: number;
  activeTab: ConfigurationTab;
};

export function useConfigurationPageData({ userId, activeTab }: UseConfigurationPageDataOptions) {
  const queryClient = useQueryClient();
  const qk = queryKeys.configuration.page(userId);

  useEffect(() => {
    hydrateConfigurationFromDisk(queryClient, userId);
  }, [queryClient, userId]);

  const readBootstrapSeed = useCallback((): Partial<ConfigurationDataPack> => {
    const boot = queryClient.getQueryData<AppBootstrapPayload>(queryKeys.app.bootstrap);
    return buildSeedFromBootstrap(boot);
  }, [queryClient]);

  const readDiskSeed = useCallback((): Partial<ConfigurationDataPack> => {
    const disk = readConfigurationPackCacheAnyAge(userId);
    return mergeConfigurationPack(readBootstrapSeed(), disk ?? undefined);
  }, [readBootstrapSeed, userId]);

  const configQuery = useQuery({
    queryKey: qk,
    queryFn: async (): Promise<Partial<ConfigurationDataPack>> => {
      const cached = queryClient.getQueryData<Partial<ConfigurationDataPack>>(qk);
      let seed = mergeConfigurationPack(readDiskSeed(), cached ?? undefined);
      const authFromDisk = readGuardedAuthBootstrapSlice() ?? readCachedBootstrap();
      if (authFromDisk?.users?.length || authFromDisk?.roles?.length) {
        seed = mergeConfigurationPack(seed, {
          users: authFromDisk.users?.length ? authFromDisk.users : seed.users,
          roles: authFromDisk.roles?.length ? authFromDisk.roles : seed.roles,
        });
      }
      const missingCritical = getMissingSlices(seed, INITIAL_CRITICAL_SLICES);
      const skipAuthFetch =
        isShellCachePatchGuarded() &&
        hasConfigurationSlice(seed, 'users') &&
        hasConfigurationSlice(seed, 'roles');
      const slicesToFetch = skipAuthFetch
        ? missingCritical.filter((k) => k !== 'users' && k !== 'roles')
        : missingCritical;

      if (isCapexBeConfigured()) {
        const token = useBackendSession() ? null : (await getAccessTokenForBackend()) ?? null;
        const revalidateKeys =
          slicesToFetch.length > 0
            ? slicesToFetch
            : excludeUserManagedConfigurationSlices([...INITIAL_CRITICAL_SLICES]);
        const fresh = await fetchFreshConfigurationSlices(token, userId, revalidateKeys);
        const merged = mergeConfigurationPack(seed, fresh);
        writeConfigurationPackCache(userId, merged, { replace: true });
        return merged;
      }

      if (slicesToFetch.length) {
        const partial = await fetchConfigurationSlicesForUser(userId, slicesToFetch);
        const merged = mergeConfigurationPack(seed, partial);
        writeConfigurationPackCache(userId, merged, { replace: true });
        return merged;
      }
      writeConfigurationPackCache(userId, seed, { replace: true });
      return seed;
    },
    staleTime: CONFIG_STALE_MS,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    placeholderData: (previousData) => {
      if (previousData) return previousData;
      const cached = queryClient.getQueryData<Partial<ConfigurationDataPack>>(qk);
      if (cached) return cached;
      const disk = readDiskSeed();
      if (Object.keys(disk).length) return disk;
      const seed = readBootstrapSeed();
      if (!Object.keys(seed).length) return undefined;
      return seed;
    },
  });

  const areSlicesPresent = useCallback(
    (slices: readonly ConfigSliceKey[]) => {
      const pack = queryClient.getQueryData<Partial<ConfigurationDataPack>>(qk);
      return getMissingSlices(pack, slices).length === 0;
    },
    [queryClient, qk],
  );

  const mergeAndPersistSlices = useCallback(
    (partial: Partial<ConfigurationDataPack>, keys: ConfigSliceKey[]) => {
      queryClient.setQueryData<Partial<ConfigurationDataPack>>(qk, (old) => {
        const base = old ?? readBootstrapSeed();
        let merged = mergeConfigurationPack(base, partial);
        if (isShellCachePatchGuarded()) {
          merged = {
            ...merged,
            users: keys.includes('users') ? (base.users ?? merged.users) : merged.users,
            roles: keys.includes('roles') ? (base.roles ?? merged.roles) : merged.roles,
          };
        }
        writeConfigurationPackCache(userId, merged, { replace: true });
        return merged;
      });
    },
    [queryClient, qk, readBootstrapSeed, userId],
  );

  const refreshSlices = useCallback(
    async (
      slices: ConfigSliceKey[],
      options?: { includeUserManaged?: boolean },
    ): Promise<boolean> => {
      let keys = [...new Set(slices)];
      if (!options?.includeUserManaged) {
        keys = excludeUserManagedConfigurationSlices(keys);
      }
      if (!keys.length) {
        return areSlicesPresent(slices);
      }

      const requestedKeys = isShellCachePatchGuarded()
        ? keys.filter((k) => k !== 'users' && k !== 'roles')
        : keys;

      if (!requestedKeys.length) {
        return areSlicesPresent(slices);
      }

      if (requestedKeys.some(isUserManagedConfigurationSlice)) {
        invalidateRequestCache('cfg:asset_type');
        invalidateRequestCache('configuration:slices:');
      }

      const containsAuthzSlices = requestedKeys.includes('users') || requestedKeys.includes('roles');

      const applyFetch = async (token: string | null) => {
        const partial = await fetchFreshConfigurationSlices(token, userId, requestedKeys);
        mergeAndPersistSlices(partial, requestedKeys);
        return areSlicesPresent(requestedKeys);
      };

      try {
        const token = (await getAccessTokenForBackend()) ?? null;
        if (await applyFetch(token)) return true;
      } catch {
        /* try fallback below */
      }

      if (!containsAuthzSlices) {
        try {
          return await applyFetch(null);
        } catch {
          return false;
        }
      }

      return areSlicesPresent(requestedKeys);
    },
    [areSlicesPresent, mergeAndPersistSlices, userId],
  );

  const ensureSlices = useCallback(
    async (slices: readonly ConfigSliceKey[]): Promise<boolean> => {
      const missing = getMissingSlices(
        queryClient.getQueryData<Partial<ConfigurationDataPack>>(qk),
        slices,
      );
      if (!missing.length) return true;
      const includeUserManaged = missing.some(isUserManagedConfigurationSlice);
      await refreshSlices(missing, { includeUserManaged });
      return areSlicesPresent(slices);
    },
    [queryClient, qk, refreshSlices, areSlicesPresent],
  );

  const patchConfigurationSlices = useCallback(
    (partial: Partial<ConfigurationDataPack>) => {
      const keys = (Object.keys(partial) as ConfigSliceKey[]).filter((key) =>
        Array.isArray(partial[key]),
      );
      if (!keys.length) return;
      mergeAndPersistSlices(partial, keys);
    },
    [mergeAndPersistSlices],
  );

  const patchUsersList = useCallback(
    (nextUsers: User[]) => {
      queryClient.setQueryData<Partial<ConfigurationDataPack>>(qk, (old) => {
        const merged = {
          ...mergeConfigurationPack(old ?? readBootstrapSeed(), undefined),
          users: nextUsers,
        };
        writeConfigurationPackCache(userId, merged, { replace: true });
        return merged;
      });
    },
    [queryClient, qk, readBootstrapSeed, userId],
  );

  const patchRolesList = useCallback(
    (nextRoles: UserRole[]) => {
      queryClient.setQueryData<Partial<ConfigurationDataPack>>(qk, (old) => {
        const merged = {
          ...mergeConfigurationPack(old ?? readBootstrapSeed(), undefined),
          roles: nextRoles,
        };
        writeConfigurationPackCache(userId, merged, { replace: true });
        return merged;
      });
    },
    [queryClient, qk, readBootstrapSeed, userId],
  );

  const [activeTabLoadStatus, setActiveTabLoadStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const activeTabLoadSeqRef = useRef(0);

  useEffect(() => {
    const required = TAB_REQUIRED_SLICES[activeTab];
    if (!required.length) {
      setActiveTabLoadStatus('idle');
      return;
    }

    const seq = ++activeTabLoadSeqRef.current;
    setActiveTabLoadStatus((prev) => {
      const next = areSlicesPresent(required) ? 'idle' : 'loading';
      return prev === next ? prev : next;
    });

    let cancelled = false;
    void (async () => {
      const ok = await ensureSlices(required);
      if (cancelled || activeTabLoadSeqRef.current !== seq) return;

      const revalidate = TAB_REVALIDATE_ON_ACTIVE_SLICES[activeTab];
      const autoRefresh = revalidate?.length
        ? excludeUserManagedConfigurationSlices(revalidate)
        : [];
      if (autoRefresh.length) {
        void refreshSlices(autoRefresh);
      }

      setActiveTabLoadStatus(ok ? 'idle' : 'error');
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, areSlicesPresent, ensureSlices, refreshSlices]);

  // Peer Super Admin UI only: poll roles/users into Configuration pack.
  // Does not call onRolesListPatch / shell sync — active end-user matrix stays until their next bootstrap.
  useEffect(() => {
    if (activeTab !== 'Users & Roles') return;

    let cancelled = false;
    let inflight = false;
    let lastFp = authzPackFingerprint(
      queryClient.getQueryData<Partial<ConfigurationDataPack>>(qk)?.roles,
      queryClient.getQueryData<Partial<ConfigurationDataPack>>(qk)?.users,
    );

    const tick = async () => {
      if (cancelled || inflight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      inflight = true;
      try {
        const token = useBackendSession() ? null : (await getAccessTokenForBackend()) ?? null;
        const fresh = await fetchFreshConfigurationSlices(token, userId, ['roles', 'users']);
        if (cancelled) return;
        if (!Array.isArray(fresh.roles) && !Array.isArray(fresh.users)) return;

        const current = queryClient.getQueryData<Partial<ConfigurationDataPack>>(qk);
        const nextRoles = Array.isArray(fresh.roles) ? fresh.roles : current?.roles;
        const nextUsers = Array.isArray(fresh.users) ? fresh.users : current?.users;
        const fp = authzPackFingerprint(nextRoles, nextUsers);
        if (fp === lastFp) return;
        lastFp = fp;

        const partial: Partial<ConfigurationDataPack> = {};
        const keys: ConfigSliceKey[] = [];
        if (Array.isArray(fresh.roles)) {
          partial.roles = fresh.roles;
          keys.push('roles');
        }
        if (Array.isArray(fresh.users)) {
          partial.users = fresh.users;
          keys.push('users');
        }
        if (!keys.length) return;
        mergeAndPersistSlices(partial, keys);
      } catch {
        /* keep last pack */
      } finally {
        inflight = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };

    void tick();
    const id = window.setInterval(() => void tick(), USERS_ROLES_PEER_POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeTab, mergeAndPersistSlices, qk, queryClient, userId]);

  const retryActiveTab = useCallback(async () => {
    const required = TAB_REQUIRED_SLICES[activeTab];
    if (!required.length) return;
    setActiveTabLoadStatus('loading');
    invalidateRequestCache('configuration:slices:');
    const ok = await ensureSlices(required);
    setActiveTabLoadStatus(ok ? 'idle' : 'error');
  }, [activeTab, ensureSlices]);

  const prefetchTab = useCallback(
    (tab: string) => {
      if (!(tab in TAB_REQUIRED_SLICES)) return;
      void ensureSlices(TAB_REQUIRED_SLICES[tab as ConfigurationTab]);
    },
    [ensureSlices],
  );

  const partialPack = useMemo(
    () => configQuery.data ?? readDiskSeed(),
    [configQuery.data, readDiskSeed],
  );
  const pack = toRenderableConfigurationPack(partialPack);
  const hasDiskOrSeed =
    hasMinimalConfigurationOnDisk(userId) ||
    isMinimalConfigurationReady(readBootstrapSeed());
  const canRenderShell =
    isMinimalConfigurationReady(partialPack) ||
    configQuery.isPlaceholderData ||
    hasDiskOrSeed;

  return {
    pack,
    partialPack,
    configQuery,
    canRenderShell,
    isInitialLoading: configQuery.isPending && !canRenderShell,
    isRevalidating: configQuery.isFetching && !configQuery.isPending && canRenderShell,
    refreshSlices,
    ensureSlices,
    prefetchTab,
    patchUsersList,
    patchRolesList,
    patchConfigurationSlices,
    activeTabLoadStatus,
    retryActiveTab,
  };
};
