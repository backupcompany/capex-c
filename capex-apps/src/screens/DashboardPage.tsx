'use client';

import React, { memo } from 'react';
import type { User } from '../types';
import { useDashboardPage } from '../hooks/useDashboardPage';
import { DashboardKpiRow } from '../components/organisms/Dashboard/DashboardKpiRow';
import { DashboardChartsSection } from '../components/organisms/Dashboard/DashboardChartsSection';
import {
  DashboardBackendUnavailable,
  DashboardBlockingSkeleton,
  DashboardEmptyPeriod,
  DashboardError,
} from '../components/organisms/Dashboard/DashboardPageStates';

export interface DashboardPageProps {
  periodName: string;
  currentUser: User;
  dataInitialized: boolean;
  hasAvailablePeriods: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = memo(function DashboardPage({
  periodName,
  currentUser,
  dataInitialized,
  hasAvailablePeriods,
}) {
  const {
    stats,
    projectCountDisplay,
    errorMessage,
    hasPeriod,
    isBlockingLoad,
    isRefreshing,
    isBackendEmpty,
  } = useDashboardPage({ periodName, currentUser });

  if (!hasPeriod) {
    if (!dataInitialized || hasAvailablePeriods) {
      return <DashboardBlockingSkeleton />;
    }
    return <DashboardEmptyPeriod />;
  }

  if (isBlockingLoad) return <DashboardBlockingSkeleton />;
  if (errorMessage) return <DashboardError message={errorMessage} />;
  if (isBackendEmpty) return <DashboardBackendUnavailable />;

  return (
    <div className="space-y-6 animate-fade-in">
      <DashboardKpiRow
        totalBudget={stats.totalBudget}
        totalConsumed={stats.totalConsumed}
        projectCountDisplay={projectCountDisplay}
        isRefreshing={isRefreshing}
      />
      <DashboardChartsSection
        projectStatusData={stats.projectStatusData}
        budgetByCategory={stats.budgetByCategory}
        sankeyData={stats.sankeyData}
      />
    </div>
  );
});

DashboardPage.displayName = 'DashboardPage';
