import type { QueryClient } from '@tanstack/react-query';
import { fetchFsRealizationBundleFromBackend } from '@/services/fsApi';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { readPageSnapshot, readPageSnapshotAnyAge, writePageSnapshot } from '@/lib/pageSnapshotCache';
import { queryKeys } from '@/lib/query-keys';
import type { EnrichedFS } from './fetchFsApprovalPageData';

const FS_REALIZATION_STALE_MS = 120_000;
const FS_REALIZATION_SNAPSHOT_KEY = 'fs-realization';

export type { EnrichedFS };

export type FsRealizationPageData = {
  periodName: string;
  allFS: EnrichedFS[];
};

export async function fetchFsRealizationPageData(
  periodName: string,
  userId: number,
): Promise<FsRealizationPageData | null> {
  if (!periodName) return null;

  const beBundle = await fetchFsRealizationBundleFromBackend(periodName, userId);
  if (!beBundle) {
    if (isCapexBeConfigured()) {
      throw new Error('Gagal memuat data FS Realization dari backend.');
    }
    throw new Error('FS Realization membutuhkan capexbe — set NEXT_PUBLIC_CAPEXBE_URL.');
  }

  const allFS: EnrichedFS[] = Array.isArray(beBundle.allFS) ? beBundle.allFS : [];
  const out: FsRealizationPageData = { periodName, allFS };

  if (allFS.length > 0) {
    writePageSnapshot(`${FS_REALIZATION_SNAPSHOT_KEY}:${periodName}:${userId}`, out);
  }

  return out;
}

function normalizeFsRealizationSnapshot(
  cached: FsRealizationPageData | null,
  periodName: string,
): FsRealizationPageData | null {
  if (!cached || cached.periodName !== periodName) return null;
  if (!Array.isArray(cached.allFS) || cached.allFS.length === 0) return null;
  return cached;
}

export function readFsRealizationSnapshot(periodName: string, userId: number): FsRealizationPageData | null {
  return normalizeFsRealizationSnapshot(
    readPageSnapshot<FsRealizationPageData>(`${FS_REALIZATION_SNAPSHOT_KEY}:${periodName}:${userId}`),
    periodName,
  );
}

export function readFsRealizationSnapshotAnyAge(periodName: string, userId: number): FsRealizationPageData | null {
  return normalizeFsRealizationSnapshot(
    readPageSnapshotAnyAge<FsRealizationPageData>(`${FS_REALIZATION_SNAPSHOT_KEY}:${periodName}:${userId}`),
    periodName,
  );
}

export function hydrateFsRealizationPageFromDisk(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
): boolean {
  if (!periodName.trim() || !Number.isFinite(userId)) return false;
  const disk = readFsRealizationSnapshotAnyAge(periodName, userId);
  if (!disk) return false;
  queryClient.setQueryData(queryKeys.fsRealization.page(periodName, userId), disk);
  return true;
}

export function resolveFsRealizationInitialData(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
): FsRealizationPageData | undefined {
  if (!periodName.trim()) return undefined;
  return (
    queryClient.getQueryData<FsRealizationPageData>(queryKeys.fsRealization.page(periodName, userId)) ??
    readFsRealizationSnapshot(periodName, userId) ??
    undefined
  );
}

export function prefetchFsRealizationPage(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
): Promise<void> {
  if (!periodName.trim()) return Promise.resolve();
  const key = ['screen', 'fs-realization', 'query', periodName, userId] as const;
  if (queryClient.getQueryState(key)?.fetchStatus === 'fetching') {
    return Promise.resolve();
  }
  return queryClient
    .prefetchQuery({
      queryKey: key,
      queryFn: async () => {
        const { fetchFsRealizationQueryFromBackend } = await import('@/services/fsApi');
        const result = await fetchFsRealizationQueryFromBackend({
          periodName,
          userId,
          page: 1,
          pageSize: 20,
          sortBy: 'projectName_asc',
          scopeFilter: null,
        });
        if (!result) throw new Error('prefetch failed');
        return result;
      },
      staleTime: FS_REALIZATION_STALE_MS,
    })
    .then(() => undefined)
    .catch(() => undefined);
}
