import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../../BudgetHU/useDebouncedValue';
import type { FsRealizationSortOption } from '../fsRealizationHelpers';

export const FS_REALIZATION_SEARCH_DEBOUNCE_MS = 150;
export const FS_REALIZATION_INITIAL_PAGE_SIZE = 20;

export function useFsRealizationFilterState(periodName: string) {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, FS_REALIZATION_SEARCH_DEBOUNCE_MS);
  const normalizedSearchTerm = searchTerm.trim().replace(/\s+/g, ' ');
  const normalizedDebouncedSearch = debouncedSearch.trim().replace(/\s+/g, ' ');
  const isSearchStaging = normalizedSearchTerm !== normalizedDebouncedSearch;

  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);
  const [selectedHUs, setSelectedHUs] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<FsRealizationSortOption>('projectName_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(FS_REALIZATION_INITIAL_PAGE_SIZE);

  const resetLocalFilters = () => {
    setSortBy('projectName_asc');
  };

  useEffect(() => {
    setSearchTerm('');
    setSelectedArchetypes([]);
    setSelectedHUs([]);
    resetLocalFilters();
    setCurrentPage(1);
    setItemsPerPage(FS_REALIZATION_INITIAL_PAGE_SIZE);
  }, [periodName]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    normalizedDebouncedSearch,
    selectedArchetypes,
    selectedHUs,
    sortBy,
    itemsPerPage,
    periodName,
  ]);

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearch: normalizedDebouncedSearch,
    isSearchStaging,
    selectedArchetypes,
    setSelectedArchetypes,
    selectedHUs,
    setSelectedHUs,
    sortBy,
    setSortBy,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    resetLocalFilters,
  };
}
