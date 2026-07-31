import { useDeferredValue, useMemo } from 'react';
import type { Project } from '@/types';

export type BudgetHuTableDisplayInput = {
  displayProjects: Project[];
  deferTableRows: boolean;
  isPageTransition?: boolean;
};

export type BudgetHuTableDisplay = {
  paginatedProjects: Project[];
  tableProjects: Project[];
};

export function useBudgetHuTableDisplay({
  displayProjects,
  deferTableRows,
  isPageTransition = false,
}: BudgetHuTableDisplayInput): BudgetHuTableDisplay {
  const paginatedProjects = useMemo(() => {
    if (isPageTransition) return [];
    return displayProjects;
  }, [isPageTransition, displayProjects]);

  const deferredProjects = useDeferredValue(paginatedProjects);
  const tableProjects = deferTableRows ? deferredProjects : paginatedProjects;

  return { paginatedProjects, tableProjects };
}
