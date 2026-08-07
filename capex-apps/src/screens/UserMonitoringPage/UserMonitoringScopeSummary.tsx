import React, { memo } from 'react';
import type { UserMonitoringScopeSummary as UserMonitoringScopeSummaryRow } from '@/types';

type UserMonitoringScopeSummaryProps = {
  title: string;
  rows: UserMonitoringScopeSummaryRow[];
  onSelect?: (label: string) => void;
  selectedLabel?: string | null;
  isLoading?: boolean;
};

function UserMonitoringScopeSummaryInner({
  title,
  rows,
  onSelect,
  selectedLabel,
  isLoading = false,
}: UserMonitoringScopeSummaryProps) {
  return (
    <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border overflow-hidden">
      <div className="px-4 py-3 border-b border-siloam-border">
        <h3 className="text-sm font-bold text-siloam-text-primary">{title}</h3>
      </div>
      <div className="max-h-[280px] overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-2 animate-pulse" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-siloam-border/60" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-siloam-bg text-xs uppercase text-siloam-text-secondary">
              <tr>
                <th className="text-left px-4 py-2">Nama</th>
                <th className="text-right px-2 py-2">Online</th>
                <th className="text-right px-2 py-2">Aktif</th>
                <th className="text-right px-2 py-2">Dormant</th>
                <th className="text-right px-4 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row) => {
                  const selected = selectedLabel === row.label;
                  const clickable = Boolean(onSelect);
                  return (
                    <tr
                      key={row.key}
                      onClick={clickable ? () => onSelect!(row.label) : undefined}
                      className={`border-t border-siloam-border ${
                        clickable ? 'cursor-pointer hover:bg-siloam-bg' : ''
                      } ${selected ? 'bg-siloam-blue/5' : ''}`}
                    >
                      <td className="px-4 py-2 font-medium text-siloam-text-primary">{row.label}</td>
                      <td className="text-right px-2 py-2 text-emerald-600 font-semibold">{row.online}</td>
                      <td className="text-right px-2 py-2 text-siloam-green">{row.active}</td>
                      <td className="text-right px-2 py-2 text-yellow-700">{row.dormant}</td>
                      <td className="text-right px-4 py-2 text-siloam-text-secondary">{row.total}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-siloam-text-secondary">
                    Tidak ada data ringkasan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export const UserMonitoringScopeSummary = memo(UserMonitoringScopeSummaryInner);
UserMonitoringScopeSummary.displayName = 'UserMonitoringScopeSummary';
