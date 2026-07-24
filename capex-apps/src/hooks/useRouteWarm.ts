import { useLayoutEffect, useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { Page, type User } from '@/types';
import {
  hydrateRouteDisk,
  prefetchRouteNetwork,
  type RouteWarmContext,
} from '@/lib/navigation/routeWarmPolicy';

type UseRouteWarmOptions = {
  enabled: boolean;
  queryClient: QueryClient;
  routePage: Page;
  periodName: string;
  currentUser: User | null;
  selectedArchetypeId?: string | null;
  selectedHuId?: string | null;
};

function buildWarmContext(options: UseRouteWarmOptions): RouteWarmContext | null {
  const { queryClient, routePage, periodName, currentUser, selectedArchetypeId, selectedHuId } =
    options;
  if (!currentUser?.id || !periodName.trim()) return null;
  return {
    queryClient,
    routePage,
    periodName,
    userId: currentUser.id,
    user: currentUser,
    selectedArchetypeId,
    selectedHuId,
  };
}

/** Route-scoped disk hydrate (before paint) + network warm (after paint). */
export function useRouteWarm(options: UseRouteWarmOptions): void {
  const {
    enabled,
    queryClient,
    routePage,
    periodName,
    currentUser,
    selectedArchetypeId,
    selectedHuId,
  } = options;
  const userId = currentUser?.id ?? null;
  const lastDiskWarmKeyRef = useRef('');

  useLayoutEffect(() => {
    if (!enabled || !userId || !periodName.trim()) return;
    const warmKey = `${routePage}:${periodName}:${userId}`;
    if (lastDiskWarmKeyRef.current === warmKey) return;
    lastDiskWarmKeyRef.current = warmKey;

    const ctx = buildWarmContext(options);
    if (!ctx) return;
    hydrateRouteDisk(ctx);
  }, [enabled, queryClient, routePage, periodName, userId, selectedArchetypeId, selectedHuId]);

  useEffect(() => {
    if (!enabled || !userId || !periodName.trim()) return;
    const ctx = buildWarmContext(options);
    if (!ctx) return;
    prefetchRouteNetwork(ctx);
  }, [enabled, queryClient, routePage, periodName, userId, selectedArchetypeId, selectedHuId]);
}
