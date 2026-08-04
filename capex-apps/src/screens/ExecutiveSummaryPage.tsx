import React, { memo, useMemo } from 'react';
import type { Archetype, User } from '../types';
import { useExecutiveDashboard } from '../hooks/useExecutiveDashboard';
import { useWhenVisible } from '../hooks/useWhenVisible';
import { ExecutiveDashboardHeader } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardHeader';
import { ExecutiveDashboardKpiRow } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardKpiRow';
import { ExecutiveDashboardTrendChart } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardTrendChart';
import { ExecutiveDashboardUnitBarChart } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardUnitBarChart';
import { ExecutiveDashboardCapexStatusChart } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardCapexStatusChart';
import { ExecutiveDashboardAnalysisSection } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardAnalysisSection';
import { ExecutiveDashboardAlerts } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardAlerts';
import {
  ExecutiveSummaryEmptyPeriod,
  ExecutiveSummaryError,
  ExecutiveSummarySelectPeriod,
} from '../components/organisms/ExecutiveSummary/ExecutiveSummaryPageStates';
import {
  ExecutiveDashboardAlertsSkeleton,
  ExecutiveDashboardAnalysisSkeleton,
  ExecutiveDashboardSkeleton,
} from '../components/organisms/ExecutiveSummary/ExecutiveDashboardSkeletons';
import { EXECUTIVE_SUMMARY_COLORS } from '../lib/executiveSummary/constants';

export interface ExecutiveSummaryPageProps {
  periodName: string;
  currentUser: User;
  selectedArchetypeId?: string | null;
  onArchetypeChange?: (id: string) => void;
  visibleArchetypes?: Archetype[];
}

function SectionReveal({
  delayMs,
  children,
}: {
  delayMs: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="animate-dashboard-drop-in"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}

function DashboardBody({
  metrics,
  filtersKey,
}: {
  metrics: ReturnType<typeof useExecutiveDashboard>['metrics'];
  filtersKey: string;
}) {
  const analysisMount = useWhenVisible();
  const alertsMount = useWhenVisible();

  const wrap = (delayMs: number, child: React.ReactNode) => (
    <SectionReveal delayMs={delayMs}>{child}</SectionReveal>
  );

  return (
    <div key={`dashboard-${filtersKey}`} className="space-y-8">
      {wrap(
        0,
        <section aria-label="Ringkasan KPI">
          <ExecutiveDashboardKpiRow metrics={metrics} />
        </section>,
      )}

      {wrap(
        80,
        <section
          aria-label="Grafik utama"
          className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch"
        >
          <ExecutiveDashboardTrendChart data={metrics.monthlyTrend} />
          <ExecutiveDashboardUnitBarChart units={metrics.budgetByUnit} />
          <ExecutiveDashboardCapexStatusChart status={metrics.capexStatus} />
        </section>,
      )}

      <div ref={analysisMount.ref}>
        {!analysisMount.visible ? (
          <ExecutiveDashboardAnalysisSkeleton />
        ) : (
          wrap(
            160,
            <section aria-label="Analisis detail">
              <ExecutiveDashboardAnalysisSection
                categories={metrics.categoryBreakdown}
                topInvestments={metrics.topInvestments}
                topUnits={metrics.topUnits}
              />
            </section>,
          )
        )}
      </div>

      <div ref={alertsMount.ref}>
        {!alertsMount.visible ? (
          <ExecutiveDashboardAlertsSkeleton />
        ) : (
          wrap(
            240,
            <section aria-label="Peringatan">
              <ExecutiveDashboardAlerts alerts={metrics.alerts} />
            </section>,
          )
        )}
      </div>
    </div>
  );
}

export const ExecutiveSummaryPage = memo(function ExecutiveSummaryPage({
  periodName,
  currentUser,
  selectedArchetypeId = null,
  onArchetypeChange,
  visibleArchetypes,
}: ExecutiveSummaryPageProps) {
  const filterLabel = useMemo(() => {
    if (!selectedArchetypeId) return 'Semua Network';
    const match = visibleArchetypes?.find((a) => String(a.id) === String(selectedArchetypeId));
    return match?.name ?? 'Network terpilih';
  }, [selectedArchetypeId, visibleArchetypes]);

  const {
    periodHeader,
    metrics,
    showDashboardSkeleton,
    showMetricsContent,
    isMetricsLoading,
    errorMessage,
    hasPeriod,
    hasNoDashboardData,
    filtersKey,
  } = useExecutiveDashboard({
    periodName,
    userId: currentUser.id,
    selectedArchetypeId,
  });

  if (!hasPeriod) return <ExecutiveSummarySelectPeriod />;
  if (errorMessage) return <ExecutiveSummaryError message={errorMessage} />;

  const showEmpty = showMetricsContent && hasNoDashboardData;

  const updatedLabel = metrics.updatedAt
    ? new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(metrics.updatedAt))
    : '—';

  return (
    <div className="flex-1 space-y-8 pb-6">
      <ExecutiveDashboardHeader
        period={periodHeader}
        visibleArchetypes={visibleArchetypes}
        selectedArchetypeId={selectedArchetypeId}
        onArchetypeChange={onArchetypeChange}
        isFilterLoading={isMetricsLoading}
      />

      {showDashboardSkeleton ? <ExecutiveDashboardSkeleton filterLabel={filterLabel} /> : null}

      {showEmpty ? <ExecutiveSummaryEmptyPeriod /> : null}

      {showMetricsContent ? (
        <DashboardBody metrics={metrics} filtersKey={filtersKey} />
      ) : null}

      <footer className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-siloam-border text-xs font-bold text-siloam-text-secondary">
        <span className="uppercase tracking-widest" style={{ color: EXECUTIVE_SUMMARY_COLORS.header }}>
          Executive Dashboard · {periodHeader?.periodName ?? periodName}
        </span>
        {showMetricsContent ? <span>Terakhir diperbarui: {updatedLabel}</span> : null}
      </footer>
    </div>
  );
});
