'use client';

import React, { memo } from 'react';
import { SpreadsheetTable, type SpreadsheetColumn } from '@/components/organisms/SpreadsheetTable/SpreadsheetTable';
import { Spinner } from '@/components/atoms/Spinner/Spinner';
import { TABLE_PAGE_SIZE_OPTIONS } from '@/lib/table/pageSizeOptions';
import type { EnrichedFS } from '@/hooks/queries/fetchFsRealizationPageData';

export type FSRealizationTableBlockProps = {
  columns: SpreadsheetColumn<EnrichedFS>[];
  data: EnrichedFS[];
  isScopePending: boolean;
  isBlockingLoad: boolean;
  showTableBusy: boolean;
  isSearchStaging: boolean;
  isTableError: boolean;
  hasActiveFilters: boolean;
  debouncedSearch: string;
  footerTotalCount: number;
  showPagination: boolean;
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
};

function FSRealizationTableSkeleton() {
  return (
    <div className="animate-pulse border border-siloam-border rounded-xl overflow-hidden" aria-hidden>
      <div className="h-10 bg-siloam-sidebar" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-12 border-t border-siloam-border flex gap-4 px-4 items-center">
          <div className="h-4 w-28 bg-siloam-border/70 rounded" />
          <div className="h-4 flex-1 max-w-xs bg-siloam-border/70 rounded" />
          <div className="h-4 w-20 bg-siloam-border/70 rounded ml-auto" />
        </div>
      ))}
    </div>
  );
}

function FSRealizationTableBlockInner({
  columns,
  data,
  isScopePending,
  isBlockingLoad,
  showTableBusy,
  isSearchStaging,
  isTableError,
  hasActiveFilters,
  debouncedSearch,
  footerTotalCount,
  showPagination,
  currentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: FSRealizationTableBlockProps) {
  return (
    <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-6 relative min-h-[20rem] flex flex-col">
      <div className="bg-siloam-blue/10 p-3 rounded-lg text-sm text-siloam-blue mb-4 flex-shrink-0">
        <strong>Note:</strong> Hanya menampilkan FS dengan kategori budget{' '}
        <strong>New Revenue Generating (NR)</strong> yang berstatus Approved atau Approved with Notes.
      </div>

      <div
        className="relative flex-1 min-h-[16rem]"
        aria-busy={showTableBusy || isBlockingLoad || isScopePending}
      >
        {showTableBusy ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-siloam-surface/70 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border border-siloam-border bg-siloam-surface px-4 py-2 text-sm text-siloam-text-secondary shadow-soft">
              <Spinner size={18} className="text-siloam-blue" />
              <span>{isSearchStaging ? 'Mencari…' : 'Memuat data terbaru…'}</span>
            </div>
          </div>
        ) : null}

        {isScopePending ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-siloam-text-secondary gap-2">
            <Spinner size={20} className="text-siloam-blue" />
            <span>Memuat scope unit…</span>
          </div>
        ) : isBlockingLoad ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center justify-center py-4 text-sm text-siloam-text-secondary gap-2">
              <Spinner size={20} className="text-siloam-blue" />
              <span>Memuat data FS Realization…</span>
            </div>
            <FSRealizationTableSkeleton />
          </div>
        ) : showTableBusy && data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-siloam-text-secondary gap-2">
            <Spinner size={20} className="text-siloam-blue" />
            <span>{isSearchStaging ? 'Mencari…' : 'Memuat data terbaru…'}</span>
          </div>
        ) : data.length > 0 ? (
          <div className={showTableBusy ? 'opacity-50 pointer-events-none select-none' : undefined}>
            <SpreadsheetTable
              columns={columns}
              data={data}
              onDataChange={() => {}}
              rowHeaderAccessor="projectName"
            />
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-siloam-text-secondary space-y-2">
            {isTableError ? (
              <span>Gagal memuat data. Periksa koneksi backend lalu refresh halaman.</span>
            ) : hasActiveFilters || debouncedSearch ? (
              <span>
                Tidak ada project NR yang cocok dengan pencarian
                {debouncedSearch ? ` "${debouncedSearch}"` : ''} atau filter saat ini.
              </span>
            ) : (
              <span>
                No approved NR (New Revenue Generating) feasibility studies found for this period in
                your unit scope.
              </span>
            )}
          </div>
        )}
      </div>

      {footerTotalCount > 0 || showTableBusy ? (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 mt-4 border-t border-siloam-border flex-shrink-0">
          <div className="text-sm text-siloam-text-secondary">
            Showing {footerTotalCount > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} -{' '}
            {Math.min(currentPage * itemsPerPage, footerTotalCount)} of {footerTotalCount} projects
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

export const FSRealizationTableBlock = memo(FSRealizationTableBlockInner);
FSRealizationTableBlock.displayName = 'FSRealizationTableBlock';
