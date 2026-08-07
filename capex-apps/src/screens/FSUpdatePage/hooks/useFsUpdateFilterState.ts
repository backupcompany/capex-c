import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../../BudgetHU/useDebouncedValue';
import type { SortOption } from '../fsUpdateHelpers';

export const FS_SEARCH_DEBOUNCE_MS = 150;

export function useFsUpdateFilterState(periodName: string) {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, FS_SEARCH_DEBOUNCE_MS);
  const isSearchStaging = searchTerm.trim() !== debouncedSearch.trim();

  const [selectedHUs, setSelectedHUs] = useState<string[]>([]);
  const [focusNeedingApproval, setFocusNeedingApproval] = useState(false);
  const [showOnlyNotFSApproved, setShowOnlyNotFSApproved] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('projectName_asc');
  const [meetingFilters, setMeetingFilters] = useState<{ archetype: string | null }>({
    archetype: null,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSizeOverride, setPageSizeOverride] = useState<number | null>(null);

  useEffect(() => {
    setSearchTerm('');
    setSelectedHUs([]);
    setFocusNeedingApproval(false);
    setShowOnlyNotFSApproved(true);
    setSortBy('projectName_asc');
    setMeetingFilters({ archetype: null });
    setCurrentPage(1);
    setPageSizeOverride(null);
  }, [periodName]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearch,
    selectedHUs,
    focusNeedingApproval,
    showOnlyNotFSApproved,
    sortBy,
    meetingFilters.archetype,
    periodName,
  ]);

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    isSearchStaging,
    selectedHUs,
    setSelectedHUs,
    focusNeedingApproval,
    setFocusNeedingApproval,
    showOnlyNotFSApproved,
    setShowOnlyNotFSApproved,
    sortBy,
    setSortBy,
    meetingFilters,
    setMeetingFilters,
    currentPage,
    setCurrentPage,
    pageSizeOverride,
    setPageSizeOverride,
  };
}
