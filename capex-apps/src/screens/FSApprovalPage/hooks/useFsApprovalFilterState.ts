import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../../BudgetHU/useDebouncedValue';
import type { FsApprovalSortOption } from '../fsApprovalHelpers';

export const FS_APPROVAL_SEARCH_DEBOUNCE_MS = 150;
export const FS_APPROVAL_INITIAL_PAGE_SIZE = 20;

export function useFsApprovalFilterState(periodName: string) {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, FS_APPROVAL_SEARCH_DEBOUNCE_MS);
  const normalizedSearchTerm = searchTerm.trim().replace(/\s+/g, ' ');
  const normalizedDebouncedSearch = debouncedSearch.trim().replace(/\s+/g, ' ');
  const isSearchStaging = normalizedSearchTerm !== normalizedDebouncedSearch;

  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);
  const [selectedHUs, setSelectedHUs] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [paybackMin, setPaybackMin] = useState<number | undefined>(undefined);
  const [paybackMax, setPaybackMax] = useState<number | undefined>(undefined);
  const [paybackMinActive, setPaybackMinActive] = useState(false);
  const [paybackMaxActive, setPaybackMaxActive] = useState(false);
  const [sortBy, setSortBy] = useState<FsApprovalSortOption>('projectName_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(FS_APPROVAL_INITIAL_PAGE_SIZE);

  const resetLocalFilters = () => {
    setPaybackMin(undefined);
    setPaybackMax(undefined);
    setPaybackMinActive(false);
    setPaybackMaxActive(false);
    setSortBy('projectName_asc');
  };

  useEffect(() => {
    setSearchTerm('');
    setSelectedArchetypes([]);
    setSelectedHUs([]);
    setSelectedCategories([]);
    resetLocalFilters();
    setCurrentPage(1);
    setItemsPerPage(FS_APPROVAL_INITIAL_PAGE_SIZE);
  }, [periodName]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    normalizedDebouncedSearch,
    selectedArchetypes,
    selectedHUs,
    selectedCategories,
    paybackMin,
    paybackMax,
    paybackMinActive,
    paybackMaxActive,
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
    selectedCategories,
    setSelectedCategories,
    paybackMin,
    setPaybackMin,
    paybackMax,
    setPaybackMax,
    paybackMinActive,
    setPaybackMinActive,
    paybackMaxActive,
    setPaybackMaxActive,
    sortBy,
    setSortBy,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    resetLocalFilters,
  };
}
