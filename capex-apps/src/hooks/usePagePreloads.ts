import { useMemo } from 'react';
import { Page, type BudgetPeriod, type User } from '@/types';
import { readBddConstructionPreload } from '@/hooks/queries/fetchBddConstructionPageData';
import {
  resolveProjectListTableForDisplay,
  defaultScopesForDiskPrefetch,
} from '@/lib/capexProjectListDiskCache';
import { resolveMyTasksBundleForDisplay } from '@/lib/myTasksDiskCache';
import { readPoUpdateSnapshotAnyAge } from '@/hooks/queries/fetchPoUpdatePageData';
import { readFsUpdateSnapshotAnyAge } from '@/hooks/queries/fetchFsUpdatePageData';
import { readFsApprovalSnapshotAnyAge } from '@/hooks/queries/fetchFsApprovalPageData';
import { readFsRealizationSnapshotAnyAge } from '@/hooks/queries/fetchFsRealizationPageData';
import { resolveBudgetHuPageForDisplay } from '@/lib/budgetHuDiskCache';

export type PagePreloads = {
  cpl: ReturnType<typeof resolveProjectListTableForDisplay>;
  bdd: ReturnType<typeof readBddConstructionPreload>;
  myTasks: ReturnType<typeof resolveMyTasksBundleForDisplay>;
  budgetHu: ReturnType<typeof resolveBudgetHuPageForDisplay>;
  poUpdate: ReturnType<typeof readPoUpdateSnapshotAnyAge>;
  fsUpdate: ReturnType<typeof readFsUpdateSnapshotAnyAge>;
  fsApproval: ReturnType<typeof readFsApprovalSnapshotAnyAge>;
  fsRealization: ReturnType<typeof readFsRealizationSnapshotAnyAge>;
};

const EMPTY_PRELOADS: PagePreloads = {
  cpl: null,
  bdd: null,
  myTasks: null,
  budgetHu: null,
  poUpdate: null,
  fsUpdate: null,
  fsApproval: null,
  fsRealization: null,
};

type UsePagePreloadsOptions = {
  routePage: Page;
  currentUser: User | null;
  selectedPeriodName: string;
  currentBudgetPeriod: BudgetPeriod | null;
  hideUnassignedBdd: boolean;
};

/** Disk preload reads scoped to active route — avoids localStorage churn on unrelated re-renders. */
export function usePagePreloads(options: UsePagePreloadsOptions): PagePreloads {
  const { routePage, currentUser, selectedPeriodName, currentBudgetPeriod, hideUnassignedBdd } =
    options;

  return useMemo(() => {
    if (typeof window === 'undefined' || !currentUser) {
      return EMPTY_PRELOADS;
    }

    const uid = currentUser.id;
    const period = selectedPeriodName;
    const fsUpdateRaw =
      routePage === Page.FSUpdate && period ? readFsUpdateSnapshotAnyAge(period, uid) : null;

    return {
      cpl:
        routePage === Page.CapexProjectList
          ? resolveProjectListTableForDisplay(
              period,
              uid,
              defaultScopesForDiskPrefetch(currentUser),
              null,
            )
          : null,
      bdd:
        routePage === Page.BDDConstruction && period
          ? readBddConstructionPreload(period, uid, hideUnassignedBdd)
          : null,
      myTasks:
        routePage === Page.MyTask
          ? resolveMyTasksBundleForDisplay(uid, period || undefined, null)
          : null,
      budgetHu:
        routePage === Page.BudgetHU
          ? resolveBudgetHuPageForDisplay(period, uid, currentBudgetPeriod, null)
          : null,
      poUpdate:
        routePage === Page.POUpdate && period ? readPoUpdateSnapshotAnyAge(uid, period) : null,
      fsUpdate:
        fsUpdateRaw && (fsUpdateRaw.editedData?.length ?? 0) > 0 ? fsUpdateRaw : null,
      fsApproval:
        routePage === Page.FSApproval && period ? readFsApprovalSnapshotAnyAge(period, uid) : null,
      fsRealization:
        routePage === Page.FSRealization && period ? readFsRealizationSnapshotAnyAge(period, uid) : null,
    };
  }, [routePage, currentUser?.id, selectedPeriodName, currentBudgetPeriod?.id, hideUnassignedBdd]);
}
