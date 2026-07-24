'use client';

import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { Page, User } from '@/types';
import { prefetchRouteOnIntent } from '@/lib/navigation/routeWarmPolicy';

type PermissionsLike = {
  canAccessPage: (page: Page) => boolean;
};

export function useNavPrefetch(options: {
  queryClient: QueryClient;
  selectedPeriodName: string;
  selectedArchetypeId?: string | null;
  selectedHuId?: string | null;
  currentUser: User | null;
  permissions: PermissionsLike;
}) {
  const {
    queryClient,
    selectedPeriodName,
    selectedArchetypeId,
    selectedHuId,
    currentUser,
    permissions,
  } = options;

  return useCallback(
    (page: Page) => {
      if (!currentUser?.id) return;
      prefetchRouteOnIntent({
        queryClient,
        routePage: page,
        periodName: selectedPeriodName,
        userId: currentUser.id,
        user: currentUser,
        selectedArchetypeId,
        selectedHuId,
        canAccessConfiguration: permissions.canAccessPage(Page.Configuration),
      });
    },
    [queryClient, selectedPeriodName, selectedArchetypeId, selectedHuId, currentUser, permissions],
  );
}
