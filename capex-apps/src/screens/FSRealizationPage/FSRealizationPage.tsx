'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { User, UserRole, ChangeSummary, FSRealization, Page } from '../../types';
import * as fsService from '../../services/fsService';
import { usePermissions } from '../../hooks/usePermissions';
import { TaskFilterPanel } from '../../components/organisms/TaskFilterPanel/TaskFilterPanel';
import { Dropdown } from '../../components/molecules/Dropdown/Dropdown';
import type { EnrichedFS, FsRealizationPageData } from '../../hooks/queries/fetchFsRealizationPageData';
import { type FsRealizationSortOption } from './fsRealizationHelpers';
import { useFsRealizationFilterState } from './hooks/useFsRealizationFilterState';
import { useFsRealizationPageData } from './hooks/useFsRealizationPageData';
import { FSRealizationTableBlock } from './FSRealizationTableBlock';
import { buildFsRealizationColumns } from './buildFsRealizationColumns';

const SORT_OPTIONS: { label: string; value: FsRealizationSortOption }[] = [
  { label: 'Project Name (A-Z)', value: 'projectName_asc' },
  { label: 'Unit (A-Z)', value: 'huName_asc' },
  { label: 'Network (A-Z)', value: 'archetypeName_asc' },
  { label: 'Approved Budget (Highest First)', value: 'amount_desc' },
  { label: 'Approved Budget (Lowest First)', value: 'amount_asc' },
  { label: 'Plan Revenue Start (Earliest)', value: 'plannedRevenueStartDate_asc' },
  { label: 'Plan Revenue Start (Latest)', value: 'plannedRevenueStartDate_desc' },
  { label: 'Monthly Revenue Plan (Highest First)', value: 'monthlyRevenuePlan_desc' },
  { label: 'Monthly Revenue Plan (Lowest First)', value: 'monthlyRevenuePlan_asc' },
];

const FSRealizationModal = lazy(() =>
  import('../../components/organisms/FSRealizationModal/FSRealizationModal').then((m) => ({
    default: m.FSRealizationModal,
  })),
);

interface FSRealizationPageProps {
  periodName: string;
  currentUser: User;
  allRoles: UserRole[];
  preloadedSnapshot?: FsRealizationPageData | null;
  headerArchetypeId?: string | null;
  headerHuId?: string | null;
  setIsPageDirty: (isDirty: boolean) => void;
  setPageActions: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const FSRealizationPage: React.FC<FSRealizationPageProps> = ({
  periodName,
  currentUser,
  allRoles,
  preloadedSnapshot: _preloadedSnapshot,
  headerArchetypeId = null,
  headerHuId = null,
  setIsPageDirty,
  setPageActions,
  showToast,
}) => {
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.FSRealization, 'view');
  const canEdit = permissions.canOperateOnPage(Page.FSRealization, 'edit');

  const [selectedFS, setSelectedFS] = useState<EnrichedFS | null>(null);
  const [realizations, setRealizations] = useState<FSRealization[]>([]);
  const [isModalLoading, setIsModalLoading] = useState(false);

  const filterState = useFsRealizationFilterState(periodName);
  const {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
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
  } = filterState;

  const pageData = useFsRealizationPageData({
    periodName,
    userId: currentUser.id,
    canView,
    userScopes: permissions.userScopes,
    debouncedSearch,
    isSearchStaging,
    selectedArchetypes,
    selectedHUs,
    sortBy,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    showToast,
  });

  const {
    tableQuery,
    serverRows,
    filterOptions,
    totalCount,
    totalPages,
    isBlockingLoad,
    showTableBusy,
    footerTotalCount,
    showPagination,
    isScopePending,
    isMasterConfigLoading,
    masterArchetypes,
    masterHus,
    invalidateFsRealizationQueries,
  } = pageData;

  useEffect(() => {
    setPageActions({
      onSave: async () => {},
      onCancel: () => {},
      getSummary: () => null,
    });
    setIsPageDirty(false);
  }, [setPageActions, setIsPageDirty]);

  const headerScopeKey = `${periodName}:${headerArchetypeId ?? ''}:${headerHuId ?? ''}`;
  const lastHeaderScopeKeyRef = useRef('');

  useEffect(() => {
    if (lastHeaderScopeKeyRef.current === headerScopeKey) return;
    lastHeaderScopeKeyRef.current = headerScopeKey;

    if (!headerArchetypeId && !headerHuId) {
      setSelectedArchetypes([]);
      setSelectedHUs([]);
      return;
    }
    if (isMasterConfigLoading) return;

    const nextArchetypes: string[] = [];
    const nextHus: string[] = [];

    if (headerArchetypeId) {
      const arch = masterArchetypes.find((a) => String(a.id) === String(headerArchetypeId));
      if (arch?.name) nextArchetypes.push(arch.name);
    }

    if (headerHuId) {
      const hu = masterHus.find((h) => String(h.id) === String(headerHuId));
      if (hu?.name) nextHus.push(hu.name);
    }

    setSelectedArchetypes(nextArchetypes);
    setSelectedHUs(nextHus);
  }, [
    headerScopeKey,
    headerArchetypeId,
    headerHuId,
    isMasterConfigLoading,
    masterArchetypes,
    masterHus,
    setSelectedArchetypes,
    setSelectedHUs,
  ]);

  const handleOpenModal = useCallback(
    async (fs: EnrichedFS) => {
      setIsModalLoading(true);
      setSelectedFS(fs);
      try {
        const existingRealizations = await fsService.getFSRealizations(fs.id, { userId: currentUser.id });
        setRealizations(existingRealizations);
      } catch (err) {
        console.error('Error loading realizations:', err);
        showToast('Failed to load realizations.', 'error');
        setSelectedFS(null);
      } finally {
        setIsModalLoading(false);
      }
    },
    [currentUser.id, showToast],
  );

  const handleSaveRealizations = useCallback(
    async (newRealizations: Omit<FSRealization, 'createdAt' | 'updatedAt'>[], actualStartDate: string) => {
      if (!selectedFS) return;
      try {
        if (selectedFS.actualRevenueStartDate !== actualStartDate) {
          await fsService.updateFSProposal(
            selectedFS.id,
            { actualRevenueStartDate: actualStartDate },
            { userId: currentUser.id, permissionContext: 'FS Realization' },
          );
        }

        await Promise.all(
          newRealizations.map((r) =>
            fsService.saveFSRealization(r as FSRealization, { userId: currentUser.id }),
          ),
        );

        showToast('Realizations saved successfully.', 'success');
        setSelectedFS(null);
        setRealizations([]);
        await invalidateFsRealizationQueries();
      } catch (err) {
        console.error('Error saving realizations:', err);
        showToast('Failed to save realizations.', 'error');
      }
    },
    [selectedFS, currentUser.id, showToast, invalidateFsRealizationQueries],
  );

  const handleCloseModal = useCallback(() => {
    setSelectedFS(null);
    setRealizations([]);
  }, []);

  const columns = useMemo(
    () =>
      buildFsRealizationColumns({
        canEdit,
        isModalLoading,
        selectedFsId: selectedFS?.id ?? null,
        onOpenModal: handleOpenModal,
      }),
    [canEdit, isModalLoading, selectedFS?.id, handleOpenModal],
  );

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? '';

  const hasActiveFilters =
    debouncedSearch.length > 0 ||
    selectedArchetypes.length > 0 ||
    selectedHUs.length > 0;

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>
    );
  }

  if (!periodName) {
    return (
      <div className="text-center p-8 text-siloam-text-secondary">
        Please select a Budget Period from the top menu to view data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-siloam-text-primary">FS Realization Tracking</h2>
        <p className="mt-1 text-sm text-siloam-text-secondary">
          Periode <span className="font-medium text-siloam-text-primary">{periodName}</span>
          {totalCount > 0 && !isBlockingLoad ? (
            <span className="ml-2">
              · {totalCount} approved NR project{totalCount === 1 ? '' : 's'} in your scope
            </span>
          ) : null}
        </p>
      </div>

      <TaskFilterPanel
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        searchPlaceholder="Search project, unit, network, category, revenue date…"
        huOptions={filterOptions.hus}
        selectedHUs={selectedHUs}
        setSelectedHUs={setSelectedHUs}
        archetypeOptions={filterOptions.archetypes}
        selectedArchetypes={selectedArchetypes}
        setSelectedArchetypes={setSelectedArchetypes}
        onResetFilters={resetLocalFilters}
      >
        <div className="w-64">
          <Dropdown
            label="Sort by"
            options={SORT_OPTIONS.map((o) => o.label)}
            selectedValue={sortLabel}
            onSelect={(label) => {
              const selected = SORT_OPTIONS.find((o) => o.label === label)?.value;
              if (selected) setSortBy(selected);
            }}
          />
        </div>
      </TaskFilterPanel>

      <FSRealizationTableBlock
        columns={columns}
        data={serverRows}
        isScopePending={isScopePending}
        isBlockingLoad={isBlockingLoad}
        showTableBusy={showTableBusy}
        isSearchStaging={isSearchStaging}
        isTableError={tableQuery.isError}
        hasActiveFilters={hasActiveFilters}
        debouncedSearch={debouncedSearch}
        footerTotalCount={footerTotalCount}
        showPagination={showPagination}
        currentPage={currentPage}
        totalPages={totalPages}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={setItemsPerPage}
      />

      {selectedFS ? (
        <Suspense fallback={null}>
          <FSRealizationModal
            fs={selectedFS}
            existingRealizations={realizations}
            onClose={handleCloseModal}
            onSave={handleSaveRealizations}
            readOnly={!canEdit}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

FSRealizationPage.displayName = 'FSRealizationPage';
