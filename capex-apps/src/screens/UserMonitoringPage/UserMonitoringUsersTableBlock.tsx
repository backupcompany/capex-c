'use client';

import React, { memo } from 'react';
import { GenericTable, type Column } from '@/components/organisms/GenericTable/GenericTable';
import { Spinner } from '@/components/atoms/Spinner/Spinner';
import { TABLE_PAGE_SIZE_OPTIONS } from '@/lib/table/pageSizeOptions';
import type { UserActivityMetric } from '@/types';
import type { UserMonitoringListFilters } from '@/services/userMonitoringApi';

export type UserMonitoringUsersTableBlockProps = {
  columns: Column<UserActivityMetric>[];
  rows: UserActivityMetric[];
  statusFilter: UserMonitoringListFilters['status'];
  onStatusFilterChange: (status: UserMonitoringListFilters['status']) => void;
  selectedUnit: string | null;
  onSelectedUnitChange: (unit: string | null) => void;
  unitOptions: string[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  isBlockingLoad: boolean;
  showTableBusy: boolean;
  isSearchStaging: boolean;
  isTableError: boolean;
  hasActiveFilters: boolean;
  normalizedSearch: string;
  totalCount: number;
  footerTotalCount: number;
  showPagination: boolean;
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
};

function UserMonitoringTableSkeleton() {
  return (
    <div className="animate-pulse border-t border-siloam-border" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-14 border-b border-siloam-border flex gap-4 px-4 items-center">
          <div className="h-4 w-32 bg-siloam-border/70 rounded" />
          <div className="h-4 w-20 bg-siloam-border/70 rounded" />
          <div className="h-4 flex-1 max-w-xs bg-siloam-border/70 rounded ml-auto" />
        </div>
      ))}
    </div>
  );
}

function UserMonitoringUsersTableBlockInner({
  columns,
  rows,
  statusFilter,
  onStatusFilterChange,
  selectedUnit,
  onSelectedUnitChange,
  unitOptions,
  searchTerm,
  onSearchTermChange,
  isBlockingLoad,
  showTableBusy,
  isSearchStaging,
  isTableError,
  hasActiveFilters,
  normalizedSearch,
  footerTotalCount,
  showPagination,
  currentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: UserMonitoringUsersTableBlockProps) {
  return (
    <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-siloam-border flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between flex-shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as UserMonitoringListFilters['status'])}
            disabled={showTableBusy}
            className="px-3 py-2 border border-siloam-border rounded-lg text-sm bg-siloam-bg focus:ring-2 focus:ring-siloam-blue outline-none disabled:opacity-50"
          >
            <option value="all">Semua status</option>
            <option value="online">Sedang online</option>
            <option value="Active">Aktif (30 hari)</option>
            <option value="Dormant">Dormant</option>
            <option value="Inactive">Inactive</option>
          </select>

          <select
            value={selectedUnit ?? ''}
            onChange={(e) => onSelectedUnitChange(e.target.value || null)}
            disabled={showTableBusy}
            className="px-3 py-2 border border-siloam-border rounded-lg text-sm bg-siloam-bg focus:ring-2 focus:ring-siloam-blue outline-none max-w-[220px] disabled:opacity-50"
          >
            <option value="">Semua unit</option>
            {unitOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <input
          type="text"
          placeholder="Cari nama, email, role, unit…"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="w-full lg:w-72 px-3 py-2 border border-siloam-border rounded-lg text-sm focus:ring-2 focus:ring-siloam-blue outline-none"
        />
      </div>

      <div className="relative flex-1 min-h-[16rem]" aria-busy={showTableBusy || isBlockingLoad}>
        {showTableBusy ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-siloam-surface/70 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border border-siloam-border bg-siloam-surface px-4 py-2 text-sm text-siloam-text-secondary shadow-soft">
              <Spinner size={18} className="text-siloam-blue" />
              <span>{isSearchStaging ? 'Mencari…' : 'Memuat data terbaru…'}</span>
            </div>
          </div>
        ) : null}

        {isBlockingLoad ? (
          <div className="space-y-3 p-4">
            <div className="flex flex-col items-center justify-center py-4 text-sm text-siloam-text-secondary gap-2">
              <Spinner size={20} className="text-siloam-blue" />
              <span>Memuat daftar pengguna…</span>
            </div>
            <UserMonitoringTableSkeleton />
          </div>
        ) : showTableBusy && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-siloam-text-secondary gap-2">
            <Spinner size={20} className="text-siloam-blue" />
            <span>{isSearchStaging ? 'Mencari…' : 'Memuat data terbaru…'}</span>
          </div>
        ) : rows.length > 0 ? (
          <div className={showTableBusy ? 'opacity-50 pointer-events-none select-none' : undefined}>
            <GenericTable
              columns={columns}
              data={rows}
              className="max-h-[520px]"
              stickyLastColumn={false}
            />
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-siloam-text-secondary px-4">
            {isTableError ? (
              <span>Gagal memuat data. Periksa koneksi backend lalu refresh halaman.</span>
            ) : hasActiveFilters || normalizedSearch ? (
              <span>
                Tidak ada pengguna yang cocok dengan pencarian
                {normalizedSearch ? ` "${normalizedSearch}"` : ''} atau filter saat ini.
              </span>
            ) : (
              <span>Tidak ada data pengguna untuk ditampilkan.</span>
            )}
          </div>
        )}
      </div>

      {footerTotalCount > 0 || showTableBusy ? (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-t border-siloam-border flex-shrink-0">
          <div className="text-sm text-siloam-text-secondary">
            Showing {footerTotalCount > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} -{' '}
            {Math.min(currentPage * itemsPerPage, footerTotalCount)} of {footerTotalCount} pengguna
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-end">
            <div className="flex items-center gap-2">
              <label className="text-sm text-siloam-text-secondary">Per page:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  onItemsPerPageChange(Number(e.target.value));
                  onPageChange(1);
                }}
                disabled={showTableBusy}
                className="px-2 py-1 border border-siloam-border rounded bg-siloam-bg text-sm focus:outline-none focus:ring-2 focus:ring-siloam-blue disabled:opacity-50"
              >
                {TABLE_PAGE_SIZE_OPTIONS.filter((s) => s <= 100).map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            {showPagination ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1 || showTableBusy}
                  className={`px-3 py-1 border border-siloam-border rounded bg-siloam-bg text-sm transition disabled:cursor-not-allowed ${
                    currentPage === 1 || showTableBusy
                      ? 'opacity-40'
                      : 'opacity-100 hover:bg-siloam-surface'
                  }`}
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    const isCurrent = currentPage === pageNum;
                    const isAdjacent = Math.abs(pageNum - currentPage) === 1;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => onPageChange(pageNum)}
                        disabled={showTableBusy}
                        className={`px-3 py-1 border rounded text-sm transition disabled:cursor-not-allowed ${
                          isCurrent
                            ? 'bg-siloam-blue text-white border-siloam-blue opacity-100'
                            : isAdjacent
                              ? 'border-siloam-border bg-siloam-bg opacity-60 hover:bg-siloam-surface hover:opacity-100'
                              : 'border-siloam-border bg-siloam-bg opacity-40 hover:bg-siloam-surface hover:opacity-70'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages || showTableBusy}
                  className={`px-3 py-1 border border-siloam-border rounded bg-siloam-bg text-sm transition disabled:cursor-not-allowed ${
                    currentPage === totalPages || showTableBusy
                      ? 'opacity-40'
                      : 'opacity-100 hover:bg-siloam-surface'
                  }`}
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const UserMonitoringUsersTableBlock = memo(UserMonitoringUsersTableBlockInner);
UserMonitoringUsersTableBlock.displayName = 'UserMonitoringUsersTableBlock';
