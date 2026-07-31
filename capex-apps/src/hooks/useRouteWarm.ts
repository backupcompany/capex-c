import { useEffect, useRef } from 'react';
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

function buildNetworkWarmKey(
  routePage: Page,
  periodName: string,
  userId: number,
  selectedArchetypeId?: string | null,
  selectedHuId?: string | null,
): string {
  switch (routePage) {
    case Page.BudgetHU:
      return `${routePage}:${periodName}:${userId}:${selectedHuId ?? ''}`;
    case Page.ExecutiveSummary:
      return `${routePage}:${periodName}:${userId}:${selectedArchetypeId ?? ''}`;
    default:
      return `${routePage}:${periodName}:${userId}`;
  }
}

/** Route-scoped disk hydrate + network warm — both deferred so UI paints first. */
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
  const lastNetworkWarmKeyRef = useRef('');

  useEffect(() => {
    if (!enabled || !userId || !periodName.trim()) return;
    const warmKey = `${routePage}:${periodName}:${userId}`;
    if (lastDiskWarmKeyRef.current === warmKey) return;
    lastDiskWarmKeyRef.current = warmKey;

    const ctx = buildWarmContext(options);
    if (!ctx) return;
    hydrateRouteDisk(ctx);
  }, [enabled, queryClient, routePage, periodName, userId]);

  useEffect(() => {
    if (!enabled || !userId || !periodName.trim()) return;
    const warmKey = buildNetworkWarmKey(
      routePage,
      periodName,
      userId,
      selectedArchetypeId,
      selectedHuId,
    );
    if (lastNetworkWarmKeyRef.current === warmKey) return;
    lastNetworkWarmKeyRef.current = warmKey;

    const ctx = buildWarmContext(options);
    if (!ctx) return;
    prefetchRouteNetwork(ctx);
  }, [
    enabled,
    queryClient,
    routePage,
    periodName,
    userId,
    selectedArchetypeId,
    selectedHuId,
  ]);
}
