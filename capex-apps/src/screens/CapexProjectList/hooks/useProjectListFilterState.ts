import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import type { User } from '../../../types';
import type { ProjectListSortOption } from '../../../services/projectListQueryTypes';
import { DEFAULT_PROJECT_LIST_SORT } from '../../../services/projectListQueryTypes';
import {
  readProjectListFilterSelection,
  writeProjectListFilterSelection,
} from '../../../lib/capexProjectListDiskCache';
import { useDebouncedValue } from './useDebouncedValue';
import { DEFAULT_TABLE_PAGE_SIZE, clampTablePageSize } from '../../../lib/table/pageSizeOptions';

/** Debounce while typing (300–500ms band); Enter/Cari flushes immediately via `submitSearch`. */
export const CPL_SEARCH_DEBOUNCE_MS = 400;

const savedSearchOnMount = () => {
  const saved =
    typeof window !== 'undefined' ? readProjectListFilterSelection() : null;
  return saved?.searchTerm ?? '';
};

export type MeetingFilters = {
  archetype: string | null;
  assetTypeGroup: string | null;
};

export type ProjectListFilterState = {
  selectedPeriods: string[];
  setSelectedPeriods: Dispatch<SetStateAction<string[]>>;
  searchTerm: string;
  setSearchTerm: Dispatch<SetStateAction<string>>;
  selectedHUs: string[];
  setSelectedHUs: Dispatch<SetStateAction<string[]>>;
  selectedPriorities: string[];
  setSelectedPriorities: Dispatch<SetStateAction<string[]>>;
  selectedFinishedTasks: string[];
  setSelectedFinishedTasks: Dispatch<SetStateAction<string[]>>;
  selectedBudgetFilter: string | null;
  setSelectedBudgetFilter: Dispatch<SetStateAction<string | null>>;
  completionRange: { min: number; max: number };
  setCompletionRange: Dispatch<SetStateAction<{ min: number; max: number }>>;
  meetingFilters: MeetingFilters;
  setMeetingFilters: Dispatch<SetStateAction<MeetingFilters>>;
  selectedBudgetCategoryIds: string[];
  setSelectedBudgetCategoryIds: Dispatch<SetStateAction<string[]>>;
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  itemsPerPage: number;
  setItemsPerPage: Dispatch<SetStateAction<number>>;
  sortBy: ProjectListSortOption;
  setSortBy: Dispatch<SetStateAction<ProjectListSortOption>>;
  /** Debounced search sent to server (same pattern as BDD Construction). */
  debouncedSearch: string;
  /** @deprecated alias — use debouncedSearch */
  appliedSearchTerm: string;
  /** Enter / Cari — apply search now (skip debounce wait). */
  submitSearch: (term: string) => void;
  clearSearch: () => void;
  isSearchActive: boolean;
  isSearchStaging: boolean;
  panelFiltersKey: string;
  prevPanelFiltersKeyRef: MutableRefObject<string>;
};

export function useProjectListFilterState(
  currentUser: User | null,
  initialSelectedPeriods: string[],
): ProjectListFilterState {
  const saved = useRef(
    typeof window !== 'undefined' ? readProjectListFilterSelection() : null,
  );

  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(() => initialSelectedPeriods);
  const initialSearch = savedSearchOnMount();
  const [searchTerm, setSearchTerm] = useState(() => initialSearch);
  const [flushSearch, setFlushSearch] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(searchTerm.trim(), CPL_SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    if (flushSearch !== null && searchTerm.trim() !== flushSearch) setFlushSearch(null);
  }, [searchTerm, flushSearch]);
  const appliedSearchTerm = flushSearch ?? debouncedSearch;
  const submitSearch = useCallback((term: string) => {
    setSearchTerm(term);
    setFlushSearch(term.trim());
  }, []);
  const [selectedHUs, setSelectedHUs] = useState<string[]>(() => saved.current?.selectedHUs ?? []);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>(
    () => saved.current?.selectedPriorities ?? [],
  );
  const [selectedFinishedTasks, setSelectedFinishedTasks] = useState<string[]>(
    () => saved.current?.selectedFinishedTasks ?? [],
  );
  const [selectedBudgetFilter, setSelectedBudgetFilter] = useState<string | null>(
    () => saved.current?.selectedBudgetFilter ?? null,
  );
  const [completionRange, setCompletionRange] = useState<{ min: number; max: number }>(() => ({
    min: saved.current?.completionMin ?? 0,
    max: saved.current?.completionMax ?? 100,
  }));
  const [meetingFilters, setMeetingFilters] = useState<MeetingFilters>(() => ({
    archetype: saved.current?.meetingArchetype ?? null,
    assetTypeGroup: saved.current?.meetingAssetTypeGroup ?? null,
  }));
  const [selectedBudgetCategoryIds, setSelectedBudgetCategoryIds] = useState<string[]>(
    () => saved.current?.selectedBudgetCategoryIds ?? [],
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() =>
    clampTablePageSize(saved.current?.itemsPerPage ?? DEFAULT_TABLE_PAGE_SIZE),
  );
  const [sortBy, setSortBy] = useState<ProjectListSortOption>(
    () => saved.current?.sortBy ?? DEFAULT_PROJECT_LIST_SORT,
  );

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setFlushSearch('');
  }, []);

  const isSearchActive = appliedSearchTerm.length > 0;
  const isSearchStaging = searchTerm.trim() !== appliedSearchTerm;

  /** Panel side-effects — keyed on applied search (debounce or Cari flush). */
  const panelFiltersKey = useMemo(
    () =>
      [
        selectedHUs.join('\u0001'),
        selectedPriorities.join('\u0001'),
        selectedFinishedTasks.join('\u0001'),
        selectedBudgetFilter ?? '',
        selectedBudgetCategoryIds.join('\u0001'),
        completionRange.min,
        completionRange.max,
        appliedSearchTerm.toLowerCase(),
      ].join('\u0002'),
    [
      selectedHUs.join('\u0001'),
      selectedPriorities.join('\u0001'),
      selectedFinishedTasks.join('\u0001'),
      selectedBudgetFilter,
      selectedBudgetCategoryIds.join('\u0001'),
      completionRange.min,
      completionRange.max,
      appliedSearchTerm,
    ],
  );
  const prevPanelFiltersKeyRef = useRef(panelFiltersKey);

  const filterSelectionSnapshot = useMemo(
    () => ({
      selectedPeriods,
      searchTerm: appliedSearchTerm,
      selectedHUs,
      selectedPriorities,
      selectedFinishedTasks,
      selectedBudgetFilter,
      selectedBudgetCategoryIds,
      completionMin: completionRange.min,
      completionMax: completionRange.max,
      meetingArchetype: meetingFilters.archetype,
      meetingAssetTypeGroup: meetingFilters.assetTypeGroup,
      itemsPerPage,
      sortBy,
    }),
    [
      selectedPeriods,
      appliedSearchTerm,
      selectedHUs,
      selectedPriorities,
      selectedFinishedTasks,
      selectedBudgetFilter,
      selectedBudgetCategoryIds,
      completionRange.min,
      completionRange.max,
      meetingFilters.archetype,
      meetingFilters.assetTypeGroup,
      itemsPerPage,
      sortBy,
    ],
  );
  const debouncedFilterSelection = useDebouncedValue(filterSelectionSnapshot, 400);

  useEffect(() => {
    if (!currentUser) return;
    writeProjectListFilterSelection(debouncedFilterSelection);
  }, [currentUser, debouncedFilterSelection]);

  return {
    selectedPeriods,
    setSelectedPeriods,
    searchTerm,
    setSearchTerm,
    selectedHUs,
    setSelectedHUs,
    selectedPriorities,
    setSelectedPriorities,
    selectedFinishedTasks,
    setSelectedFinishedTasks,
    selectedBudgetFilter,
    setSelectedBudgetFilter,
    completionRange,
    setCompletionRange,
    meetingFilters,
    setMeetingFilters,
    selectedBudgetCategoryIds,
    setSelectedBudgetCategoryIds,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    sortBy,
    setSortBy,
    debouncedSearch: appliedSearchTerm,
    appliedSearchTerm,
    submitSearch,
    clearSearch,
    isSearchActive,
    isSearchStaging,
    panelFiltersKey,
    prevPanelFiltersKeyRef,
  };
}
