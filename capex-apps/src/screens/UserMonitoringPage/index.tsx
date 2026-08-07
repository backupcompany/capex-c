'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User, UserRole, Page } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';
import { usePagedListScreen } from '@/hooks/usePagedListScreen';
import type { UserMonitoringListFilters } from '@/services/userMonitoringApi';
import { USER_MONITORING_REFETCH_MS } from './hooks/useUserMonitoringPageData';
import { useUserMonitoringPageData } from './hooks/useUserMonitoringPageData';
import { UserMonitoringStatCards } from './UserMonitoringStatCards';
import { UserMonitoringScopeSummary } from './UserMonitoringScopeSummary';
import { UserMonitoringUsersTableBlock } from './UserMonitoringUsersTableBlock';
import { buildUserMonitoringColumns } from './buildUserMonitoringColumns';

const SEARCH_DEBOUNCE_MS = 150;

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

interface UserMonitoringPageProps {
  currentUser: User;
  allRoles?: UserRole[];
}

export const UserMonitoringPage: React.FC<UserMonitoringPageProps> = ({
  currentUser,
  allRoles = [],
}) => {
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.UserMonitoring, 'view');

  const [statusFilter, setStatusFilter] = useState<UserMonitoringListFilters['status']>('all');
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);

  const {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    isSearchStaging,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
  } = usePagedListScreen({
    filterResetKey: `${statusFilter}\u0001${selectedUnit ?? ''}`,
    initialPageSize: 25,
    searchDebounceMs: SEARCH_DEBOUNCE_MS,
  });

  const pageData = useUserMonitoringPageData({
    userId: currentUser.id,
    canView,
    debouncedSearch,
    isSearchStaging,
    statusFilter,
    selectedUnit,
    currentPage,
    itemsPerPage,
  });

  const {
    tableQuery,
    tableRows,
    totalCount,
    totalPages,
    showPagination,
    isBlockingLoad,
    showTableBusy,
    isBundleLoading,
    summary,
    unitOptions,
    archetypeSummary,
    unitSummary,
    liveNowMs,
    refreshAll,
    hasActiveFilters,
    normalizedSearch,
  } = pageData;

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages, setCurrentPage]);

  const handleUnitPick = useCallback((unitName: string) => {
    setSelectedUnit((prev) => (prev === unitName ? null : unitName));
  }, []);

  const roleCatalogOrder = useMemo(
    () => allRoles.map((r) => r.roleName).filter(Boolean),
    [allRoles],
  );

  const columns = useMemo(
    () => buildUserMonitoringColumns(liveNowMs, roleCatalogOrder),
    [liveNowMs, roleCatalogOrder],
  );

  const refetchSeconds = Math.round(USER_MONITORING_REFETCH_MS / 1000);

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">
        Anda tidak memiliki izin untuk melihat halaman ini.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-siloam-text-primary">User Monitoring</h1>
          <p className="text-sm text-siloam-text-secondary mt-1">
            Data diperbarui otomatis setiap {refetchSeconds} detik dari sesi login & aktivitas aplikasi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          className="self-start p-2 bg-siloam-surface border border-siloam-border rounded-lg hover:bg-siloam-bg text-siloam-text-secondary transition"
          title="Refresh"
          aria-label="Refresh data"
        >
          <RefreshIcon />
        </button>
      </div>

      <UserMonitoringStatCards summary={summary} isLoading={isBundleLoading} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <UserMonitoringScopeSummary
          title="Ringkasan per Network"
          rows={archetypeSummary}
          isLoading={isBundleLoading}
        />
        <UserMonitoringScopeSummary
          title="Ringkasan per Unit"
          rows={unitSummary}
          onSelect={handleUnitPick}
          selectedLabel={selectedUnit}
          isLoading={isBundleLoading}
        />
      </div>

      <UserMonitoringUsersTableBlock
        columns={columns}
        rows={tableRows}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        selectedUnit={selectedUnit}
        onSelectedUnitChange={setSelectedUnit}
        unitOptions={unitOptions}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        isBlockingLoad={isBlockingLoad}
        showTableBusy={showTableBusy}
        isSearchStaging={isSearchStaging}
        isTableError={tableQuery.isError}
        hasActiveFilters={hasActiveFilters}
        normalizedSearch={normalizedSearch}
        totalCount={totalCount}
        footerTotalCount={totalCount}
        showPagination={showPagination}
        currentPage={currentPage}
        totalPages={totalPages}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={setItemsPerPage}
      />
    </div>
  );
};

UserMonitoringPage.displayName = 'UserMonitoringPage';
