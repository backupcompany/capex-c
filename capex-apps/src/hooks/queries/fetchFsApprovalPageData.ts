import type { QueryClient } from '@tanstack/react-query';
import type { FeasibilityStudy } from '@/types';
import { fetchFsApprovalBundleFromBackend } from '@/services/fsApi';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { readPageSnapshot, readPageSnapshotAnyAge, writePageSnapshot } from '@/lib/pageSnapshotCache';
import { queryKeys } from '@/lib/query-keys';

const FS_APPROVAL_STALE_MS = 120_000;
const FS_APPROVAL_SNAPSHOT_KEY = 'fs-approval';

export type EnrichedFS = FeasibilityStudy & {
    archetypeName: string;
    huName: string;
    projectName: string;
    capexCategoryName: string;
};

export type FsApprovalPageData = {
    periodName: string;
    allFS: EnrichedFS[];
};

export async function fetchFsApprovalPageData(
    periodName: string,
    userId: number,
): Promise<FsApprovalPageData | null> {
    if (!periodName) return null;

    const beBundle = await fetchFsApprovalBundleFromBackend(periodName, userId);
    if (!beBundle) {
        if (isCapexBeConfigured()) {
            throw new Error('Gagal memuat data FS Approval dari backend.');
        }
        throw new Error('FS Approval membutuhkan capexbe — set NEXT_PUBLIC_CAPEXBE_URL.');
    }

    const allFS: EnrichedFS[] = Array.isArray(beBundle.allFS) ? beBundle.allFS : [];

    const out: FsApprovalPageData = {
        periodName,
        allFS,
    };

    writePageSnapshot(`${FS_APPROVAL_SNAPSHOT_KEY}:${periodName}:${userId}`, out);

    return out;
}

function normalizeFsApprovalSnapshot(
    cached: FsApprovalPageData | null,
    periodName: string,
): FsApprovalPageData | null {
    if (!cached || cached.periodName !== periodName) return null;
    return cached;
}

export function readFsApprovalSnapshot(periodName: string, userId: number): FsApprovalPageData | null {
    return normalizeFsApprovalSnapshot(
        readPageSnapshot<FsApprovalPageData>(`${FS_APPROVAL_SNAPSHOT_KEY}:${periodName}:${userId}`),
        periodName,
    );
}

export function readFsApprovalSnapshotAnyAge(periodName: string, userId: number): FsApprovalPageData | null {
    return normalizeFsApprovalSnapshot(
        readPageSnapshotAnyAge<FsApprovalPageData>(`${FS_APPROVAL_SNAPSHOT_KEY}:${periodName}:${userId}`),
        periodName,
    );
}

export function hydrateFsApprovalPageFromDisk(
    queryClient: QueryClient,
    periodName: string,
    userId: number,
): boolean {
    if (!periodName.trim() || !Number.isFinite(userId)) return false;
    const disk = readFsApprovalSnapshotAnyAge(periodName, userId);
    if (!disk) return false;
    queryClient.setQueryData(queryKeys.fsApproval.page(periodName, userId), disk);
    return true;
}

export function resolveFsApprovalInitialData(
    queryClient: QueryClient,
    periodName: string,
    userId: number,
): FsApprovalPageData | undefined {
    if (!periodName.trim()) return undefined;
    return (
        queryClient.getQueryData<FsApprovalPageData>(queryKeys.fsApproval.page(periodName, userId)) ??
        readFsApprovalSnapshot(periodName, userId) ??
        undefined
    );
}

export function prefetchFsApprovalPage(
    queryClient: QueryClient,
    periodName: string,
    userId: number,
): Promise<void> {
    if (!periodName.trim()) return Promise.resolve();
    const key = ['screen', 'fs-approval', 'query', periodName, userId] as const;
    if (queryClient.getQueryState(key)?.fetchStatus === 'fetching') {
        return Promise.resolve();
    }
    return queryClient
        .prefetchQuery({
            queryKey: key,
            queryFn: async () => {
                const { fetchFsApprovalQueryFromBackend } = await import('@/services/fsApi');
                const result = await fetchFsApprovalQueryFromBackend({
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
            staleTime: FS_APPROVAL_STALE_MS,
        })
        .then(() => undefined)
        .catch(() => undefined);
}
