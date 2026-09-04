'use client';

import React, { memo } from 'react';
import type { EnrichedAsset } from '@/types';
import type { Column } from '@/components/organisms/GenericTable/GenericTable';
import { GenericTable } from '@/components/organisms/GenericTable/GenericTable';
import { Spinner } from '@/components/atoms/Spinner/Spinner';
import { TABLE_PAGE_SIZE_OPTIONS } from '@/lib/table/pageSizeOptions';
import { CapexProjectListMobileAssetList } from './CapexProjectListMobileAssetList';

function TableSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="absolute inset-0 z-[5] flex flex-col gap-0 bg-siloam-surface/85 px-4 py-3 pointer-events-none animate-fade-in">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex gap-4 border-b border-siloam-border/60 py-3 animate-pulse"
          style={{ animationDelay: `${i * 70}ms` }}
          aria-hidden
        >
          <div className="h-4 w-24 rounded bg-siloam-border/80" />
          <div className="h-4 flex-1 max-w-[140px] rounded bg-siloam-border/60" />
          <div className="h-4 flex-1 max-w-[180px] rounded bg-siloam-border/60" />
          <div className="h-4 w-16 rounded bg-siloam-border/50" />
        </div>
      ))}
    </div>
  );
}

export type CapexProjectListTableBlockProps = {
  columns: Column<EnrichedAsset>[];
  paginatedAssets: EnrichedAsset[];
  selectedAssetId?: string | number | null;
  onRowClick: (asset: EnrichedAsset) => void;
  onRowHover: (asset: EnrichedAsset) => void;
  showBlockingSkeleton: boolean;
  isTableLoading: boolean;
  isSearchPending: boolean;
  isBackgroundRefetch: boolean;
  hasActiveFilters: boolean;
  /** Shown when search returns 0 rows (scope / no match). */
  searchEmptyHint?: string | null;
  footerTotalCount: number;
  currentPage: number;
  itemsPerPage: number;
  totalPages: number;
  isExporting: boolean;
  onExportExcel: () => void;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
};

function CapexProjectListTableBlockInner({
  columns,
  paginatedAssets,
  selectedAssetId,
  onRowClick,
  onRowHover,
  showBlockingSkeleton,
  isTableLoading,
  isSearchPending,
  isBackgroundRefetch,
  hasActiveFilters,
  searchEmptyHint = null,
  footerTotalCount,
  currentPage,
  itemsPerPage,
  totalPages,
  isExporting,
  onExportExcel,
  onPageChange,
  onItemsPerPageChange,
}: CapexProjectListTableBlockProps) {
  const showTableBusy = isTableLoading || isSearchPending;
  const showPagination = footerTotalCount > itemsPerPage;
  const loadingLabel =
    isSearchPending && !showBlockingSkeleton
      ? 'Mencari…'
      : showBlockingSkeleton
        ? 'Memuat daftar proyek…'
        : 'Memuat data terbaru…';

  return (
    <div data-tour="cpl-asset-table" className="flex-1 overflow-hidden flex flex-col relative">
      {searchEmptyHint ? (
        <div
          role="status"
          className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950"
        >
          {searchEmptyHint}
        </div>
      ) : null}
      {isBackgroundRefetch ? (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-siloam-border"
            aria-hidden
          >
            <div className="h-full w-1/3 animate-pulse rounded-full bg-siloam-blue/70" />
          </div>
          <div className="pointer-events-none absolute right-2 top-1 z-20 rounded border border-siloam-border bg-siloam-surface/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-siloam-text-secondary shadow-sm">
            Memperbarui…
          </div>
        </>
      ) : null}

      <div
        className={`hidden md:block flex-1 overflow-hidden relative transition-opacity duration-200 ${
          showTableBusy && !showBlockingSkeleton ? 'opacity-50 pointer-events-none select-none' : 'opacity-100'
        }`}
      >
        {showBlockingSkeleton ? <TableSkeletonRows /> : null}
        {showTableBusy ? (
          <div className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center bg-siloam-surface/70 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border border-siloam-border bg-siloam-surface px-4 py-2 text-sm text-siloam-text-secondary shadow-soft">
              <Spinner size={18} className="text-siloam-blue" />
              <span>{loadingLabel}</span>
            </div>
          </div>
        ) : null}
        {!showBlockingSkeleton && !showTableBusy && paginatedAssets.length === 0 ? (
          <div className="flex h-full min-h-[12rem] items-center justify-center px-4 text-center text-sm text-siloam-text-secondary">
            {searchEmptyHint
              ? searchEmptyHint
              : hasActiveFilters
                ? 'No assets found matching the filters.'
                : 'No assets found.'}
          </div>
        ) : (
          <GenericTable
            columns={columns}
            data={paginatedAssets}
            onRowClick={onRowClick}
            onRowMouseEnter={onRowHover}
            selectedRowId={selectedAssetId}
            className="h-full border-none"
            virtualizeRows="auto"
            estimatedRowHeight={52}
          />
        )}
      </div>

      <div
        className={`block md:hidden flex-1 overflow-hidden p-4 relative transition-opacity duration-200 ${
          showTableBusy && !showBlockingSkeleton ? 'opacity-50 pointer-events-none select-none' : 'opacity-100'
        }`}
      >
        {showBlockingSkeleton ? <TableSkeletonRows rows={6} /> : null}
        {showTableBusy ? (
          <div className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center bg-siloam-surface/70 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border border-siloam-border bg-siloam-surface px-4 py-2 text-sm text-siloam-text-secondary shadow-soft">
              <Spinner size={18} className="text-siloam-blue" />
              <span>{loadingLabel}</span>
            </div>
          </div>
        ) : null}
        <CapexProjectListMobileAssetList
          assets={paginatedAssets}
          selectedAssetId={selectedAssetId}
          onRowClick={onRowClick}
          onRowHover={onRowHover}
          hasActiveFilters={hasActiveFilters}
          emptyHint={searchEmptyHint}
        />
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-t border-siloam-border bg-siloam-surface">
        <div className="flex items-center gap-3">
          <div className="text-sm text-siloam-text-secondary">
            Showing {footerTotalCount > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} -{' '}
            {Math.min(currentPage * itemsPerPage, footerTotalCount)} of {footerTotalCount} assets
            {isBackgroundRefetch ? (
              <span className="ml-2 text-siloam-blue">· Memperbarui…</span>
            ) : null}
          </div>
          <button
            type="button"
            data-tour="cpl-export"
            onClick={onExportExcel}
            disabled={footerTotalCount === 0 || isExporting || showTableBusy}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            title={
              footerTotalCount > 0
                ? `Export semua ${footerTotalCount.toLocaleString('id-ID')} baris (sesuai filter)`
                : 'No data to export'
            }
          >
            {isExporting ? 'Menyiapkan…' : 'Export Excel'}
          </button>
        </div>

        <div className="flex items-center gap-4 flex-wrap justify-end">
          <div className="flex items-center gap-2">
            <label className="text-sm text-siloam-text-secondary" htmlFor="fld-per-page">Per page:</label>
            <select id="fld-per-page"
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              disabled={showTableBusy}
              className="px-2 py-1 border border-siloam-border rounded bg-siloam-bg text-sm focus:outline-none focus:ring-2 focus:ring-siloam-blue disabled:opacity-50"
            >
              {TABLE_PAGE_SIZE_OPTIONS.map((size) => (
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
    </div>
  );
}

export const CapexProjectListTableBlock = memo(CapexProjectListTableBlockInner);
CapexProjectListTableBlock.displayName = 'CapexProjectListTableBlock';
