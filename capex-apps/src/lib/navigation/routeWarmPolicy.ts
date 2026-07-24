import type { QueryClient } from '@tanstack/react-query';
import { Page, type User } from '@/types';
import { prefetchScreenChunk } from '@/screens/registry';
import {
  hydrateCapexProjectListTableFromDisk,
  warmCapexProjectListTableCache,
} from '@/lib/prefetchCapexProjectList';
import {
  hydrateBddConstructionTableFromDisk,
  warmBddConstructionTableCache,
} from '@/lib/prefetchBddConstruction';
import {
  hydrateConfigurationFromDisk,
  prefetchConfigurationPageCritical,
} from '@/lib/prefetchConfigurationPage';
import { prefetchMyTasksPage, hydrateMyTasksFromDisk } from '@/lib/prefetchMyTasksPage';
import {
  hydrateBudgetHuPageFromDisk,
  prefetchBudgetHuPage,
} from '@/hooks/queries/warmBudgetHuCache';
import { prefetchDashboardBundle } from '@/lib/prefetchDashboardBundle';
import { prefetchExecutiveDashboard } from '@/lib/prefetchExecutiveDashboard';
import { prefetchBudgetSiloamPeriod } from '@/lib/prefetchBudgetSiloamPeriod';
import { prefetchBudgetMultiYearPage } from '@/lib/prefetchBudgetMultiYearPage';
import {
  hydratePoUpdatePageFromDisk,
  prefetchPoUpdatePage,
} from '@/hooks/queries/fetchPoUpdatePageData';
import { prefetchGrUpdatePage } from '@/hooks/queries/fetchGrUpdatePageData';
import {
  hydrateFsUpdatePageFromDisk,
  prefetchFsUpdatePage,
} from '@/hooks/queries/fetchFsUpdatePageData';
import {
  hydrateFsApprovalPageFromDisk,
  prefetchFsApprovalPage,
} from '@/hooks/queries/fetchFsApprovalPageData';
import {
  hydrateFsRealizationPageFromDisk,
  prefetchFsRealizationPage,
} from '@/hooks/queries/fetchFsRealizationPageData';
import { scheduleRouteIntentPrefetch, scheduleRouteNetworkPrefetch } from '@/lib/prefetchGate';

export type RouteWarmContext = {
  queryClient: QueryClient;
  routePage: Page;
  periodName: string;
  userId: number;
  user: User;
  selectedArchetypeId?: string | null;
  selectedHuId?: string | null;
};

/** Sync disk hydrate before paint — seeds TanStack for instant first paint. */
export function hydrateRouteDisk(ctx: RouteWarmContext): void {
  const { queryClient, routePage, periodName, userId: uid, user } = ctx;
  if (!periodName.trim()) return;

  switch (routePage) {
    case Page.Configuration:
      hydrateConfigurationFromDisk(queryClient, uid);
      break;
    case Page.BudgetHU:
      hydrateBudgetHuPageFromDisk(queryClient, periodName, uid);
      break;
    case Page.CapexProjectList:
      hydrateCapexProjectListTableFromDisk(queryClient, periodName, uid);
      break;
    case Page.POUpdate:
      hydratePoUpdatePageFromDisk(queryClient, uid, periodName);
      break;
    case Page.FSUpdate:
      hydrateFsUpdatePageFromDisk(queryClient, periodName, uid);
      break;
    case Page.FSApproval:
      hydrateFsApprovalPageFromDisk(queryClient, periodName, uid);
      break;
    case Page.FSRealization:
      hydrateFsRealizationPageFromDisk(queryClient, periodName, uid);
      break;
    case Page.BDDConstruction:
      hydrateBddConstructionTableFromDisk(queryClient, periodName, user);
      break;
    case Page.MyTask:
      hydrateMyTasksFromDisk(queryClient, uid, periodName || undefined);
      break;
    default:
      break;
  }
}

/** Chunk + network warm after paint — avoids blocking navigation transition. */
export function prefetchRouteNetwork(ctx: RouteWarmContext): void {
  const { queryClient, routePage, periodName, userId: uid, user, selectedArchetypeId, selectedHuId } =
    ctx;
  if (!periodName.trim()) return;

  prefetchScreenChunk(routePage);
  const huId = selectedHuId ?? undefined;

  const warm = (fn: () => void | Promise<void>) => scheduleRouteNetworkPrefetch(fn);

  switch (routePage) {
    case Page.BudgetHU:
      warm(() => prefetchBudgetHuPage(queryClient, periodName, uid, { hospitalUnitId: huId }));
      break;
    case Page.Dashboard:
      warm(() => prefetchDashboardBundle(queryClient, periodName, uid));
      break;
    case Page.ExecutiveSummary:
      warm(() => prefetchExecutiveDashboard(queryClient, periodName, uid, selectedArchetypeId ?? null));
      break;
    case Page.BudgetPeriod:
    case Page.BudgetArchetype:
      warm(() => prefetchBudgetSiloamPeriod(queryClient, periodName, uid));
      break;
    case Page.CapexProjectList:
      warm(() => warmCapexProjectListTableCache(queryClient, periodName, uid));
      break;
    case Page.POUpdate:
      warm(() => prefetchPoUpdatePage(queryClient, uid, periodName));
      break;
    case Page.GRUpdate:
      warm(() => prefetchGrUpdatePage(queryClient, uid, periodName));
      break;
    case Page.FSUpdate:
      warm(() => prefetchFsUpdatePage(queryClient, periodName, uid));
      break;
    case Page.FSApproval:
      warm(() => prefetchFsApprovalPage(queryClient, periodName, uid));
      break;
    case Page.FSRealization:
      warm(() => prefetchFsRealizationPage(queryClient, periodName, uid));
      break;
    case Page.BudgetMultiYear:
      warm(() => prefetchBudgetMultiYearPage(queryClient, uid));
      break;
    case Page.BDDConstruction:
      warm(() => warmBddConstructionTableCache(queryClient, periodName, user));
      break;
    case Page.MyTask:
      warm(() => prefetchMyTasksPage(queryClient, user, periodName || undefined));
      break;
    default:
      break;
  }
}

/** Warm caches when budget period changes — active route only. */
export function warmRouteOnPeriodChange(
  ctx: RouteWarmContext & { pinArchetypeId?: string | null; pinHuId?: string | null },
): void {
  const { queryClient, routePage, periodName, userId: uid, pinArchetypeId, pinHuId } = ctx;

  switch (routePage) {
    case Page.Dashboard:
      prefetchDashboardBundle(queryClient, periodName, uid);
      break;
    case Page.ExecutiveSummary:
      prefetchExecutiveDashboard(queryClient, periodName, uid, pinArchetypeId ?? null);
      break;
    case Page.BudgetHU:
      prefetchBudgetHuPage(queryClient, periodName, uid, {
        hospitalUnitId: pinHuId ?? undefined,
      });
      hydrateBudgetHuPageFromDisk(queryClient, periodName, uid);
      break;
    case Page.CapexProjectList:
      hydrateCapexProjectListTableFromDisk(queryClient, periodName, uid);
      break;
    case Page.MyTask:
      hydrateMyTasksFromDisk(queryClient, uid, periodName || undefined);
      break;
    case Page.FSUpdate:
      hydrateFsUpdatePageFromDisk(queryClient, periodName, uid);
      break;
    case Page.FSApproval:
      hydrateFsApprovalPageFromDisk(queryClient, periodName, uid);
      break;
    case Page.FSRealization:
      hydrateFsRealizationPageFromDisk(queryClient, periodName, uid);
      break;
    case Page.POUpdate:
      hydratePoUpdatePageFromDisk(queryClient, uid, periodName);
      break;
    case Page.BudgetPeriod:
    case Page.BudgetArchetype:
      prefetchBudgetSiloamPeriod(queryClient, periodName, uid);
      break;
    default:
      break;
  }
}

export type RouteIntentPrefetchContext = RouteWarmContext & {
  canAccessConfiguration?: boolean;
};

/** Hover/focus prefetch — chunk + disk + network for destination route. */
export function prefetchRouteOnIntent(ctx: RouteIntentPrefetchContext): void {
  const {
    queryClient,
    routePage,
    periodName,
    userId: uid,
    user,
    selectedArchetypeId,
    selectedHuId,
    canAccessConfiguration,
  } = ctx;

  prefetchScreenChunk(routePage);

  if (routePage === Page.BudgetPeriod && periodName.trim()) {
    prefetchBudgetSiloamPeriod(queryClient, periodName, uid);
  }

  if (periodName.trim()) {
    if (routePage === Page.FSUpdate) {
      hydrateFsUpdatePageFromDisk(queryClient, periodName, uid);
      scheduleRouteIntentPrefetch(`fs-update:${uid}`, () => prefetchFsUpdatePage(queryClient, periodName, uid));
    } else if (routePage === Page.FSApproval) {
      hydrateFsApprovalPageFromDisk(queryClient, periodName, uid);
      scheduleRouteIntentPrefetch(`fs-approval:${uid}`, () =>
        prefetchFsApprovalPage(queryClient, periodName, uid),
      );
    } else if (routePage === Page.FSRealization) {
      hydrateFsRealizationPageFromDisk(queryClient, periodName, uid);
      scheduleRouteIntentPrefetch(`fs-realization:${uid}`, () =>
        prefetchFsRealizationPage(queryClient, periodName, uid),
      );
    }
  }

  if (routePage === Page.MyTask) {
    scheduleRouteIntentPrefetch(`my-task:${uid}`, () =>
      prefetchMyTasksPage(queryClient, user, periodName || undefined),
    );
  }

  if (routePage === Page.CapexProjectList && periodName.trim()) {
    hydrateCapexProjectListTableFromDisk(queryClient, periodName, uid);
    scheduleRouteIntentPrefetch(`cpl:${uid}:${periodName}`, () =>
      warmCapexProjectListTableCache(queryClient, periodName, uid),
    );
  }

  if (routePage === Page.BDDConstruction && periodName.trim()) {
    hydrateBddConstructionTableFromDisk(queryClient, periodName, user);
    scheduleRouteIntentPrefetch(`bdd:${uid}:${periodName}`, () =>
      warmBddConstructionTableCache(queryClient, periodName, user),
    );
  }

  if (routePage === Page.BudgetHU && periodName.trim()) {
    scheduleRouteIntentPrefetch(`bhu:${uid}:${periodName}`, () =>
      prefetchBudgetHuPage(queryClient, periodName, uid, {
        hospitalUnitId: selectedHuId ?? undefined,
      }),
    );
  }

  if (routePage === Page.BudgetMultiYear) {
    scheduleRouteIntentPrefetch(`bmy:${uid}`, () => prefetchBudgetMultiYearPage(queryClient, uid));
  }

  if (routePage === Page.Configuration && canAccessConfiguration) {
    hydrateConfigurationFromDisk(queryClient, uid);
    scheduleRouteIntentPrefetch(`cfg:${uid}`, () => prefetchConfigurationPageCritical(queryClient, uid));
  }

  if (routePage === Page.ExecutiveSummary && periodName.trim()) {
    scheduleRouteIntentPrefetch(`exec:${uid}:${periodName}`, () =>
      prefetchExecutiveDashboard(queryClient, periodName, uid, selectedArchetypeId ?? null),
    );
  }

  if (routePage === Page.Dashboard && periodName.trim()) {
    scheduleRouteIntentPrefetch(`dash:${uid}:${periodName}`, () =>
      prefetchDashboardBundle(queryClient, periodName, uid),
    );
  }

  if (routePage === Page.POUpdate && periodName.trim()) {
    hydratePoUpdatePageFromDisk(queryClient, uid, periodName);
    scheduleRouteIntentPrefetch(`po:${uid}:${periodName}`, () =>
      prefetchPoUpdatePage(queryClient, uid, periodName),
    );
  }

  if (routePage === Page.GRUpdate) {
    scheduleRouteIntentPrefetch(`gr:${uid}:${periodName}`, () =>
      prefetchGrUpdatePage(queryClient, uid, periodName),
    );
  }
}
