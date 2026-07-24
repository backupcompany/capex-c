import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project } from '@/types';
import { queryKeys } from '@/lib/query-keys';
import { fetchBudgetHuProjectsPage } from '@/services/budgetHuPageApi';
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

  const resetSession = () => {
    originalsRef.current.clear();
    editsRef.current.clear();
    deletedRef.current.clear();
  };

  return { originalsRef, editsRef, deletedRef, resetSession };
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

  useEffect(() => {
    session.resetSession();
  }, [periodName, huKey, session]);

  const query = useQuery({
    queryKey: queryKeys.budgetHu.projectsPage(periodName, userId, huKey, page, pageSize, searchKey),
    queryFn: () => fetchBudgetHuProjectsPage(periodName, userId, huKey, page, pageSize, searchKey),
    enabled: enabled && !!periodName.trim() && !!huKey && Number.isFinite(userId),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (!query.data?.projects) return;
    for (const project of query.data.projects) {
      if (!session.originalsRef.current.has(project.id)) {
        session.originalsRef.current.set(project.id, project);
      }
    }
  }, [query.data?.projects, session.originalsRef]);

  const displayProjects = useMemo(() => {
    const rows = query.data?.projects ?? [];
    return sortProjectsByCode(
      rows.map((project) => {
        if (session.deletedRef.current.has(project.id)) return null;
        return session.editsRef.current.get(project.id) ?? project;
      }).filter((p): p is Project => p != null),
    );
  }, [query.data?.projects, query.dataUpdatedAt, editRevision, session.editsRef, session.deletedRef]);

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
