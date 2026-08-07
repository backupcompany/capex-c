import React, { memo, useMemo } from 'react';
import type { ExecutiveDashboardMonthlyPoint } from '../../../lib/executiveSummary/dashboardTypes';
import { formatBudgetView } from '../../../lib/formatter';
import { ExecutiveDashboardPanel } from './ExecutiveDashboardPanel';

interface ExecutiveDashboardTrendChartProps {
  data: ExecutiveDashboardMonthlyPoint[];
}

export const ExecutiveDashboardTrendChart = memo(function ExecutiveDashboardTrendChart({
  data,
}: ExecutiveDashboardTrendChartProps) {
  const showPriorYear = useMemo(() => data.some((d) => d.priorYear > 0), [data]);

  const { maxBar, maxLine } = useMemo(() => {
    if (data.length === 0) return { maxBar: 0, maxLine: 0 };
    const realizations = data.map((d) => d.realization);
    const targets = data.map((d) => d.budgetTarget);
    const priors = showPriorYear ? data.map((d) => d.priorYear) : [];
    return {
      maxBar: Math.max(...realizations, ...priors, 1),
      maxLine: Math.max(...targets, ...realizations, 1),
    };
  }, [data, showPriorYear]);

  const hasRealization = data.some((d) => d.realization > 0);

  if (data.length === 0 || (!hasRealization && !showPriorYear)) {
    return (
      <ExecutiveDashboardPanel title="Tren Penggunaan Budget (YTD)">
        <p className="text-sm text-siloam-text-secondary text-center py-12 m-auto">Belum ada data realisasi.</p>
      </ExecutiveDashboardPanel>
    );
  }

  return (
    <ExecutiveDashboardPanel title="Tren Penggunaan Budget (YTD)">
      <div className="flex items-center justify-end gap-3 text-[11px] mb-3 flex-wrap shrink-0">
        <Legend color="#00529B" label="Realisasi periode ini" />
        {showPriorYear ? <Legend color="#94A3B8" label="Periode sebelumnya" /> : null}
        <Legend color="#00A3E0" label="Target budget bulanan" dashed />
      </div>
      <div className="flex items-end gap-1.5 h-48 px-1 flex-1 min-h-0">
        {data.map((point) => {
          const barH = point.realization > 0 ? Math.max((point.realization / maxBar) * 100, 10) : 0;
          const priorH = point.priorYear > 0 ? Math.max((point.priorYear / maxBar) * 100, 8) : 0;
          const targetBottom = Math.min((point.budgetTarget / maxLine) * 100, 100);
          return (
            <div key={point.month} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full">
              <div className="w-full flex items-end justify-center gap-0.5 flex-1 relative min-h-0">
                {showPriorYear && point.priorYear > 0 ? (
                  <Bar heightPct={priorH} color="#CBD5E1" title={`${point.label} LY: ${formatBudgetView(point.priorYear)}`} />
                ) : null}
                {point.realization > 0 ? (
                  <Bar heightPct={barH} color="#00529B" title={`${point.label}: ${formatBudgetView(point.realization)}`} />
                ) : null}
                {point.budgetTarget > 0 ? (
                  <div
                    className="absolute left-0 right-0 border-t-2 border-dashed border-sky-400 pointer-events-none"
                    style={{ bottom: `${targetBottom}%` }}
                    title={`Target: ${formatBudgetView(point.budgetTarget)}`}
                  />
                ) : null}
              </div>
              <span className="text-[10px] text-siloam-text-secondary font-medium truncate w-full text-center shrink-0">
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
    </ExecutiveDashboardPanel>
  );
});

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-2.5 h-2.5 rounded-sm ${dashed ? 'border-2 border-dashed bg-transparent' : ''}`}
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
      />
      <span className="text-siloam-text-secondary">{label}</span>
    </div>
  );
}

function Bar({ heightPct, color, title }: { heightPct: number; color: string; title: string }) {
  return (
    <div
      className="w-2.5 sm:w-3 rounded-t-sm transition-all min-h-[4px]"
      style={{ height: `${heightPct}%`, backgroundColor: color }}
      title={title}
    />
  );
}
