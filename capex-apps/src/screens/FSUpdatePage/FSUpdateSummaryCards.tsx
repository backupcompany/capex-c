import React, { memo } from 'react';
import { formatCurrency } from '@/lib/formatter';

export type FsSummary = {
  submittedQty: number;
  submittedAmountIdr: number;
  approvedQty: number;
  approvedAmountIdr: number;
  notApprovedQty: number;
};

type FSUpdateSummaryCardsProps = {
  summary: FsSummary;
  isLoading?: boolean;
};

const SUMMARY_ITEMS: {
  key: keyof FsSummary;
  label: string;
  format: (v: number) => string;
  valueClass: string;
}[] = [
  {
    key: 'submittedQty',
    label: 'Total FS yang Diajukan (Jumlah QTY)',
    format: (v) => v.toLocaleString('id-ID'),
    valueClass: 'text-siloam-text-primary',
  },
  {
    key: 'submittedAmountIdr',
    label: 'Total FS Amount (Diajukan)',
    format: (v) => formatCurrency(v),
    valueClass: 'text-siloam-blue',
  },
  {
    key: 'approvedQty',
    label: 'Total FS Approved Qty',
    format: (v) => v.toLocaleString('id-ID'),
    valueClass: 'text-siloam-green',
  },
  {
    key: 'approvedAmountIdr',
    label: 'Total FS Amount (Approved)',
    format: (v) => formatCurrency(v),
    valueClass: 'text-siloam-green',
  },
  {
    key: 'notApprovedQty',
    label: 'Total FS Belum Diapproved',
    format: (v) => v.toLocaleString('id-ID'),
    valueClass: 'text-warning',
  },
];

function FSUpdateSummaryCardsInner({ summary, isLoading = false }: FSUpdateSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" aria-busy={isLoading}>
      {SUMMARY_ITEMS.map(({ key, label, format, valueClass }) => (
        <div
          key={key}
          className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
            {label}
          </p>
          {isLoading ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded bg-siloam-border/60" />
          ) : (
            <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>
              {format(summary[key] as number)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export const FSUpdateSummaryCards = memo(FSUpdateSummaryCardsInner);
FSUpdateSummaryCards.displayName = 'FSUpdateSummaryCards';
