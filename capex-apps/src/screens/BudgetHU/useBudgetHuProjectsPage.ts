import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project } from '@/types';
import { queryKeys } from '@/lib/query-keys';
import { fetchBudgetHuProjectsPage } from '@/services/budgetHuPageApi';
import { cloneDeep } from '@/lib/clone';
import { sortProjectsByCode } from './budgetHuHelpers';

const STALE_MS = 5 * 60 * 1000;
const GC_MS = 30 * 60 * 1000;

export type BudgetHuProjectsPageSession = {
  originalsRef: React.MutableRefObject<Map<string, Project>>;
  editsRef: React.MutableRefObject<Map<string, Project>>;
  deletedRef: React.MutableRefObject<Set<string>>;
  resetSession: () => void;
};

export function useBudgetHuProjectsPageSession(): BudgetHuProjectsPageSession {
  const originalsRef = useRef(new Map<string, Project>());
  const editsRef = useRef(new Map<string, Project>());
  const deletedRef = useRef(new Set<string>());

  const resetSession = useCallback(() => {
    originalsRef.current.clear();
    editsRef.current.clear();
    deletedRef.current.clear();
  }, []);

  // Stable identity — callers put `session` in effect deps; a new object each render
  // used to wipe edits via resetSession before Save could see them.
  return useMemo(
    () => ({ originalsRef, editsRef, deletedRef, resetSession }),
    [resetSession],
  );
}

type UseBudgetHuProjectsPageArgs = {
  periodName: string;
  userId: number;
  huId: string | null;
  page: number;
  pageSize: number;
  search: string;
  enabled: boolean;
  session: BudgetHuProjectsPageSession;
  /** Bump after inline edits so displayProjects re-merges session edits. */
  editRevision?: number;
};

export function useBudgetHuProjectsPage({
  periodName,
  userId,
  huId,
  page,
  pageSize,
  search,
  enabled,
  session,
  editRevision = 0,
}: UseBudgetHuProjectsPageArgs) {
  const queryClient = useQueryClient();
  const huKey = String(huId ?? '').trim();
  const searchKey = search.trim();
  const { resetSession, originalsRef, editsRef, deletedRef } = session;

  useEffect(() => {
    resetSession();
  }, [periodName, huKey, resetSession]);

  const query = useQuery({
    queryKey: queryKeys.budgetHu.projectsPage(periodName, userId, huKey, page, pageSize, searchKey),
    queryFn: () => fetchBudgetHuProjectsPage(periodName, userId, huKey, page, pageSize, searchKey),
    enabled: enabled && !!periodName.trim() && !!huKey && Number.isFinite(userId),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  // Seed originals during render (before any cell edit) — skip placeholder from previous HU/page.
  if (query.data?.projects && !query.isPlaceholderData) {
    for (const project of query.data.projects) {
      if (!originalsRef.current.has(project.id)) {
        originalsRef.current.set(project.id, cloneDeep(project));
      }
    }
  }

  const displayProjects = useMemo(() => {
    const rows = query.data?.projects ?? [];
    const mapped = rows
      .map((project) => {
        if (deletedRef.current.has(project.id)) return null;
        return editsRef.current.get(project.id) ?? project;
      })
      .filter((p): p is Project => p != null);

    // Staged creates (no server original yet) — show on current page so Save/Cancel UX works.
    for (const [id, edit] of editsRef.current.entries()) {
      if (deletedRef.current.has(id)) continue;
      if (originalsRef.current.has(id)) continue;
      if (mapped.some((p) => p.id === id)) continue;
      mapped.push(edit);
    }

    return sortProjectsByCode(mapped);
  }, [
    query.data?.projects,
    query.dataUpdatedAt,
    editRevision,
    editsRef,
    deletedRef,
    originalsRef,
  ]);

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const studies = query.data?.studies ?? [];

  const invalidatePage = () => {
    void queryClient.invalidateQueries({
      queryKey: ['screen', 'budget-hu-projects-page', periodName, userId, huKey],
    });
  };

  return {
    query,
    displayProjects,
    total,
    totalPages,
    studies,
    invalidatePage,
    isLoading: query.isPending && !query.data,
    isFetching: query.isFetching,
  };
}
