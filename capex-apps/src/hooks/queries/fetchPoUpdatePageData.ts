import type { QueryClient } from '@tanstack/react-query';
import type { ArchetypeConfig, EnrichedAsset, HospitalUnitConfig, ProjectPriorityConfig } from '@/types';
import { fetchPoUpdateBundleFromBackend } from '@/services/poUpdateApi';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { readPageSnapshot, readPageSnapshotAnyAge, writePageSnapshot } from '@/lib/pageSnapshotCache';
import { queryKeys } from '@/lib/query-keys';

const PO_STALE_MS = 120_000;

const PO_SNAPSHOT_KEY = 'po-update';

export type PoUpdatePageData = {
  assets: EnrichedAsset[];
  masterData: {
    archetypes: ArchetypeConfig[];
    hus: HospitalUnitConfig[];
    projects: unknown[];
    priorities: ProjectPriorityConfig[];
  };
  assetLastTaskMap: Record<string, string>;
  assetHasPOMap: Record<string, boolean>;
};

export async function fetchPoUpdatePageData(
  userId: number,
  periodName?: string,
): Promise<PoUpdatePageData> {
  const period = periodName?.trim() || '';
  const beBundle = await fetchPoUpdateBundleFromBackend(userId, period);

  if (beBundle) {
    const out: PoUpdatePageData = {
      assets: beBundle.assets,
      masterData: {
        archetypes: beBundle.archetypes,
        hus: beBundle.hus,
        projects: beBundle.projects,
        priorities: beBundle.priorities,
      },
      assetLastTaskMap: beBundle.assetLastTaskMap ?? {},
      assetHasPOMap: beBundle.assetHasPOMap ?? {},
    };
    writePageSnapshot(`${PO_SNAPSHOT_KEY}:${period}:${userId}`, out);
    return out;
  }

  if (isCapexBeConfigured()) {
    throw new Error('Gagal memuat data PO Update dari backend.');
  }

  throw new Error('PO Update membutuhkan capexbe — set NEXT_PUBLIC_CAPEXBE_URL.');
}

/** Cache memori → session snapshot (tampil instan sebelum fetch). */
export function readPoUpdateSnapshotAnyAge(userId: number, periodName?: string): PoUpdatePageData | null {
  const period = periodName?.trim() || '';
  const cached = readPageSnapshotAnyAge<PoUpdatePageData>(`${PO_SNAPSHOT_KEY}:${period}:${userId}`);
  if (cached?.assets?.length) return cached;
  const legacy = readPageSnapshotAnyAge<PoUpdatePageData>(`${PO_SNAPSHOT_KEY}:${userId}`);
  return legacy?.assets?.length ? legacy : null;
}

export function resolvePoUpdateInitialData(
  queryClient: QueryClient,
  userId: number,
  periodName?: string,
): PoUpdatePageData | undefined {
  const period = periodName?.trim() || '';
  return (
    queryClient.getQueryData<PoUpdatePageData>(queryKeys.poUpdate.page(period, userId)) ??
    readPoUpdateSnapshot(userId, period) ??
    readPoUpdateSnapshotAnyAge(userId, period) ??
    undefined
  );
}

export function prefetchPoUpdatePage(
  queryClient: QueryClient,
  userId: number,
  periodName?: string,
): Promise<void> {
  const period = periodName?.trim() || '';
  if (queryClient.getQueryState(queryKeys.poUpdate.page(period, userId))?.fetchStatus === 'fetching') {
    return Promise.resolve();
  }
  return queryClient
    .prefetchQuery({
      queryKey: queryKeys.poUpdate.page(period, userId),
      queryFn: () => fetchPoUpdatePageData(userId, period),
      staleTime: PO_STALE_MS,
    })
    .then(() => undefined);
}

/** Baca snapshot disk untuk placeholder awal (opsional). */
export function readPoUpdateSnapshot(userId: number, periodName?: string): PoUpdatePageData | null {
  const period = periodName?.trim() || '';
  const cached = readPageSnapshot<PoUpdatePageData>(`${PO_SNAPSHOT_KEY}:${period}:${userId}`);
  if (!cached?.assets?.length) {
    const legacy = readPageSnapshot<PoUpdatePageData>(`${PO_SNAPSHOT_KEY}:${userId}`);
    if (legacy?.assets?.length) return legacy;
    return null;
  }
  return cached;
}

export function hydratePoUpdatePageFromDisk(
  queryClient: QueryClient,
  userId: number,
  periodName?: string,
): void {
  const period = periodName?.trim() || '';
  const snapshot =
    readPoUpdateSnapshot(userId, period) ?? readPoUpdateSnapshotAnyAge(userId, period);
  if (!snapshot?.assets?.length) return;
  queryClient.setQueryData(queryKeys.poUpdate.page(period, userId), snapshot);
}
