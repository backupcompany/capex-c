'use client';

import React, { memo } from 'react';
import type { Column } from '@/components/organisms/GenericTable/GenericTable';
import { GenericTable } from '@/components/organisms/GenericTable/GenericTable';
import { Spinner } from '@/components/atoms/Spinner/Spinner';
import type { EnrichedAsset } from '@/types';

export type BddConstructionTableBlockProps = {
  columns: Column<EnrichedAsset>[];
  tableAssets: EnrichedAsset[];
  selectedAssetId?: string | number | null;
  onRowClick: (asset: EnrichedAsset) => void;
  footerTotalCount: number;
  currentPage: number;
  itemsPerPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
  isTableLoading?: boolean;
  isSearchPending?: boolean;
};

function BddConstructionTableBlockInner({
  columns,
  tableAssets,
  selectedAssetId,
  onRowClick,
  footerTotalCount,
  currentPage,
  itemsPerPage,
  totalPages,
  onPageChange,
  onItemsPerPageChange,
  isTableLoading = false,
  isSearchPending = false,
}: BddConstructionTableBlockProps) {
  const showTableBusy = isTableLoading || isSearchPending;

  return (
    <div className="flex-1 min-h-0 bg-siloam-surface rounded-xl border border-siloam-border overflow-hidden flex flex-col relative">
      {showTableBusy ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-siloam-surface/70 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-lg border border-siloam-border bg-siloam-surface px-4 py-2 text-sm text-siloam-text-secondary shadow-soft">
            <Spinner size={18} className="text-siloam-blue" />
            <span>{isSearchPending && !isTableLoading ? 'Mencari…' : 'Memuat data terbaru…'}</span>
          </div>
        </div>
      ) : null}
      <div className={showTableBusy ? 'flex flex-col flex-1 min-h-0 opacity-50 select-none' : 'flex flex-col flex-1 min-h-0'}>
      <GenericTable
        columns={columns}
        data={tableAssets}
        onRowClick={onRowClick}
        selectedRowId={selectedAssetId}
        className="flex-1 min-h-0 border-none"
        virtualizeRows="auto"
        estimatedRowHeight={56}
      />
      {footerTotalCount > 0 && (
        <div className="px-4 py-3 border-t border-siloam-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-siloam-text-secondary">
            Showing {(currentPage - 1) * itemsPerPage + 1} -{' '}
            {Math.min(currentPage * itemsPerPage, footerTotalCount)} of {footerTotalCount} assets
            {isTableLoading ? (
              <span className="ml-2 text-siloam-blue">· Memperbarui…</span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="px-2 py-1 border border-siloam-border rounded bg-siloam-bg text-xs"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs border border-siloam-border rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-xs text-siloam-text-secondary">
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-xs border border-siloam-border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export const BddConstructionTableBlock = memo(BddConstructionTableBlockInner);
