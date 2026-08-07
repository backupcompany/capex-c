'use client';

import React, { memo, type RefObject } from 'react';
import { SpreadsheetTable, type SpreadsheetColumn } from '@/components/organisms/SpreadsheetTable/SpreadsheetTable';
import { Spinner } from '@/components/atoms/Spinner/Spinner';
import {
  TABLE_PAGE_SIZE_OPTIONS,
  clampTablePageSize,
} from '@/lib/table/pageSizeOptions';
import type { FsEditableProject } from './fsUpdateHelpers';

export type FSUpdateTableBlockProps = {
  tableScrollHostRef: RefObject<HTMLDivElement | null>;
  columns: SpreadsheetColumn<FsEditableProject>[];
  data: FsEditableProject[];
  onDataChange: (data: FsEditableProject[]) => void;
  periodName: string;
  tableMaxHeight: string;
  isBlockingLoad: boolean;
  showTableBusy: boolean;
  isSearchStaging: boolean;
  isTableError: boolean;
  totalCount: number;
  footerTotalCount: number;
  showPagination: boolean;
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  viewportPageSize: number;
  pageSizeOverride: number | null;
  onPageChange: (page: number) => void;
  onPageSizeOverrideChange: (override: number | null) => void;
};

function FSUpdateTableBlockInner({
  tableScrollHostRef,
  columns,
  data,
  onDataChange,
  periodName,
  tableMaxHeight,
  isBlockingLoad,
  showTableBusy,
  isSearchStaging,
  isTableError,
  totalCount,
  footerTotalCount,
  showPagination,
  currentPage,
  totalPages,
  itemsPerPage,
  viewportPageSize,
  pageSizeOverride,
  onPageChange,
  onPageSizeOverrideChange,
}: FSUpdateTableBlockProps) {
  return (
    <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-6 relative min-h-[20rem] flex flex-col">
      <div className="bg-siloam-blue/10 p-3 rounded-lg text-sm text-siloam-blue mb-4 flex-shrink-0">
        <strong>Note:</strong> Approved Budget for &apos;Network Pipeline&apos; and &apos;General & Routine
        Assets&apos; projects are automatically synced with their Budget Plan and cannot be edited here.
      </div>

      <div
        ref={tableScrollHostRef}
        className="relative flex-1 min-h-[16rem]"
        aria-busy={showTableBusy || isBlockingLoad}
      >
        {showTableBusy && data.length > 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-siloam-surface/70 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border border-siloam-border bg-siloam-surface px-4 py-2 text-sm text-siloam-text-secondary shadow-soft">
              <Spinner size={18} className="text-siloam-blue" />
              <span>{isSearchStaging ? 'Mencari…' : 'Memuat data terbaru…'}</span>
            </div>
          </div>
        ) : null}

        {isBlockingLoad ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-siloam-text-secondary gap-2">
            <Spinner size={20} className="text-siloam-blue" />
            <span>Memuat data project…</span>
          </div>
        ) : data.length > 0 ? (
          <div className={showTableBusy ? 'opacity-50 pointer-events-none select-none' : undefined}>
            <SpreadsheetTable
              columns={columns}
              data={data}
              onDataChange={onDataChange}
              rowHeaderAccessor="projectName"
              virtualizeRows="auto"
              maxHeight={tableMaxHeight}
            />
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-siloam-text-secondary">
            {isTableError ? (
              <span>Gagal memuat data. Periksa koneksi backend lalu refresh halaman.</span>
            ) : totalCount > 0 ? (
              <span>
                Tidak ada project yang cocok dengan filter saat ini. Coba matikan &quot;Show only
                projects not FS Approved&quot; atau reset filter.
              </span>
            ) : (
              <span>Tidak ada data project untuk periode {periodName}.</span>
            )}
          </div>
        )}
      </div>

      {footerTotalCount > 0 || showTableBusy ? (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 mt-4 border-t border-siloam-border flex-shrink-0">
          <div className="text-sm text-siloam-text-secondary">
            Showing {footerTotalCount > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} -{' '}
            {Math.min(currentPage * itemsPerPage, footerTotalCount)} of {footerTotalCount} projects
            {pageSizeOverride == null ? (
              <span className="ml-2 text-xs text-siloam-text-secondary/80">
                (auto {itemsPerPage} rows/viewport)
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-end">
            <div className="flex items-center gap-2">
              <label className="text-sm text-siloam-text-secondary">Per page:</label>
              <select
                value={pageSizeOverride == null ? 'auto' : String(pageSizeOverride)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'auto') {
                    onPageSizeOverrideChange(null);
                  } else {
                    onPageSizeOverrideChange(clampTablePageSize(Number(v)));
                  }
                  onPageChange(1);
                }}
                disabled={showTableBusy}
                className="px-2 py-1 border border-siloam-border rounded bg-siloam-bg text-sm focus:outline-none focus:ring-2 focus:ring-siloam-blue disabled:opacity-50"
              >
                <option value="auto">Auto ({viewportPageSize})</option>
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
      ) : null}
    </div>
  );
}

export const FSUpdateTableBlock = memo(FSUpdateTableBlockInner);
FSUpdateTableBlock.displayName = 'FSUpdateTableBlock';
