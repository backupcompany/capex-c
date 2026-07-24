'use client';

import React, { memo } from 'react';
import {
  Page,
  type Archetype,
  type BudgetPeriod,
  type ChangeSummary,
  type User,
  type UserRole,
} from '@/types';
import {
  LazyDashboardPage,
  LazyExecutiveSummaryPage,
  LazyAIAnalyticsPage,
  LazyUserMonitoringPage,
  LazyDataMigrationPage,
  LazyCapexProjectListPage,
  LazyBDDConstructionPage,
  LazyMomDailySummaryPage,
  LazyMyTaskPage,
  LazyBudgetMultiYearPage,
  LazyBudgetPeriodPage,
  LazyBudgetArchetypePage,
  LazyBudgetHUPage,
  LazyPOUpdatePage,
  LazyGRUpdatePage,
  LazyFSUpdatePage,
  LazyFSApprovalPage,
  LazyFSRealizationPage,
  LazyConfigurationPage,
  LazyProfilePage,
} from '@/screens/registry';
import { areUserScopesReadyForList } from '@/lib/appUserBootstrap';
import type { PagePreloads } from '@/hooks/usePagePreloads';
import type { ShowToastOptions } from '@/contexts/ToastContext';

type PermissionsLike = {
  canAccessPage: (page: Page) => boolean;
};

export type AppRouteRendererProps = {
  routePage: Page;
  currentUser: User;
  allRoles: UserRole[];
  allUsers: User[];
  allPeriods: BudgetPeriod[];
  dataInitialized: boolean;
  shellPermissionsReady: boolean;
  selectedPeriodName: string;
  selectedArchetypeId: string | null;
  selectedHuId: string | null;
  currentBudgetPeriod: BudgetPeriod | null;
  visibleArchetypes: Archetype[];
  pagePreloads: PagePreloads;
  permissions: PermissionsLike;
  desktopNotificationsEnabled: boolean;
  browserNotificationPermission: NotificationPermission | 'unsupported';
  onDesktopNotificationsToggle: (enabled: boolean) => void;
  onRequestDesktopPermission: () => Promise<void>;
  onExecutiveArchetypeChange: (archetypeId: string) => void;
  onBudgetPageDataChange: () => void;
  onBudgetPeriodSaved: (next: BudgetPeriod) => void;
  onConfigurationChange: () => void;
  onUsersListPatch: (users: User[]) => void;
  onRolesListPatch: (roles: UserRole[]) => void;
  onBudgetDataRefresh: () => void;
  onConfigDataRefresh: () => void;
  onGoToFirstAccessiblePage: () => void;
  setIsPageDirty: (dirty: boolean) => void;
  setPageActions: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
  showToast: (message: string, type?: 'success' | 'error', options?: ShowToastOptions) => void;
};

function AppRouteRendererComponent({
  routePage,
  currentUser,
  allRoles,
  allUsers,
  allPeriods,
  dataInitialized,
  shellPermissionsReady,
  selectedPeriodName,
  selectedArchetypeId,
  selectedHuId,
  currentBudgetPeriod,
  visibleArchetypes,
  pagePreloads,
  permissions,
  desktopNotificationsEnabled,
  browserNotificationPermission,
  onDesktopNotificationsToggle,
  onRequestDesktopPermission,
  onExecutiveArchetypeChange,
  onBudgetPageDataChange,
  onBudgetPeriodSaved,
  onConfigurationChange,
  onUsersListPatch,
  onRolesListPatch,
  onBudgetDataRefresh,
  onConfigDataRefresh,
  onGoToFirstAccessiblePage,
  setIsPageDirty,
  setPageActions,
  showToast,
}: AppRouteRendererProps) {
  if (!shellPermissionsReady) {
    return (
      <div
        className="flex-1 p-4 md:p-8 h-screen flex items-center justify-center"
        aria-busy="true"
        aria-label="Memuat akses"
      >
        <div className="w-full max-w-md space-y-3 animate-pulse" aria-hidden>
          <div className="h-8 w-2/3 rounded-lg bg-siloam-border/50" />
          <div className="h-32 rounded-xl bg-siloam-border/30" />
          <div className="h-20 rounded-xl bg-siloam-border/20" />
        </div>
      </div>
    );
  }

  if (!permissions.canAccessPage(routePage)) {
    return (
      <div className="flex-1 p-4 md:p-8 text-center h-screen flex items-center justify-center">
        <div className="bg-siloam-surface rounded-xl p-8 shadow-soft max-w-md">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-siloam-text-primary mb-2">Access Denied</h2>
          <p className="text-siloam-text-secondary mb-4">
            You don&apos;t have permission to access this page.
          </p>
          <p className="text-sm text-siloam-text-secondary">
            Please contact your administrator if you believe this is an error.
          </p>
          <button
            type="button"
            onClick={onGoToFirstAccessiblePage}
            className="mt-6 bg-siloam-blue text-white px-6 py-2 rounded-xl hover:bg-siloam-blue/90 transition"
          >
            Go to first menu
          </button>
        </div>
      </div>
    );
  }

  const commonPageProps = {
    setIsPageDirty,
    setPageActions,
    showToast,
  };

  const refreshPoGrData = () => {
    onBudgetDataRefresh();
    onConfigDataRefresh();
  };

  switch (routePage) {
    case Page.Dashboard:
      return <LazyDashboardPage periodName={selectedPeriodName} currentUser={currentUser} />;
    case Page.ExecutiveSummary:
      return (
        <LazyExecutiveSummaryPage
          periodName={selectedPeriodName}
          currentUser={currentUser}
          selectedArchetypeId={selectedArchetypeId}
          onArchetypeChange={onExecutiveArchetypeChange}
          visibleArchetypes={visibleArchetypes}
        />
      );
    case Page.AIAnalytics:
      return <LazyAIAnalyticsPage currentUser={currentUser} />;
    case Page.UserMonitoring:
      return <LazyUserMonitoringPage currentUser={currentUser} allRoles={allRoles} />;
    case Page.DataMigration:
      return <LazyDataMigrationPage currentUser={currentUser} />;
    case Page.CapexProjectList:
      return (
        <LazyCapexProjectListPage
          key={`cpl-${currentUser.id}`}
          currentUser={currentUser}
          periodName={selectedPeriodName}
          budgetPeriods={allPeriods}
          preloadedProjectList={pagePreloads.cpl}
          userScopesReady={areUserScopesReadyForList(currentUser, dataInitialized, allUsers)}
        />
      );
    case Page.BDDConstruction:
      return (
        <LazyBDDConstructionPage
          key={`bdd-${currentUser.id}-${selectedPeriodName}`}
          currentUser={currentUser}
          allRoles={allRoles}
          showToast={showToast}
          periodName={selectedPeriodName}
          preloadedSnapshot={pagePreloads.bdd}
        />
      );
    case Page.DailyMOMSummary:
      return (
        <LazyMomDailySummaryPage
          currentUser={currentUser}
          allRoles={allRoles}
          periodName={selectedPeriodName}
        />
      );
    case Page.MyTask:
      return (
        <LazyMyTaskPage
          key={`my-task-${currentUser.id}-${selectedPeriodName}`}
          currentUser={currentUser}
          allRoles={allRoles}
          periodName={selectedPeriodName}
          preloadedTasks={pagePreloads.myTasks}
        />
      );
    case Page.BudgetMultiYear:
      return (
        <LazyBudgetMultiYearPage
          allPeriods={allPeriods}
          onDataChange={onBudgetPageDataChange}
          currentUser={currentUser}
          allRoles={allRoles}
          {...commonPageProps}
        />
      );
    case Page.BudgetPeriod:
      return (
        <LazyBudgetPeriodPage
          onBudgetPeriodSaved={onBudgetPeriodSaved}
          periodName={selectedPeriodName}
          currentUser={currentUser}
          allRoles={allRoles}
          {...commonPageProps}
        />
      );
    case Page.BudgetArchetype:
      return (
        <LazyBudgetArchetypePage
          onDataChange={onBudgetPageDataChange}
          onBudgetPeriodSaved={onBudgetPeriodSaved}
          periodName={selectedPeriodName}
          archetypeId={selectedArchetypeId}
          currentUser={currentUser}
          allRoles={allRoles}
          {...commonPageProps}
        />
      );
    case Page.BudgetHU:
      return (
        <LazyBudgetHUPage
          key={`bhu-${currentUser.id}`}
          onDataChange={onBudgetPageDataChange}
          onBudgetPeriodSaved={onBudgetPeriodSaved}
          periodName={selectedPeriodName}
          archetypeId={selectedArchetypeId}
          huId={selectedHuId}
          currentUser={currentUser}
          allRoles={allRoles}
          allUsers={allUsers}
          currentBudgetPeriod={currentBudgetPeriod}
          preloadedBudgetHuPage={pagePreloads.budgetHu}
          {...commonPageProps}
        />
      );
    case Page.POUpdate:
      return (
        <LazyPOUpdatePage
          key={`po-update-${currentUser.id}-${selectedPeriodName}`}
          currentUser={currentUser}
          allRoles={allRoles}
          periodName={selectedPeriodName}
          preloadedSnapshot={pagePreloads.poUpdate}
          onDataChange={refreshPoGrData}
          {...commonPageProps}
        />
      );
    case Page.GRUpdate:
      return (
        <LazyGRUpdatePage
          key={`gr-update-${currentUser.id}-${selectedPeriodName}`}
          periodName={selectedPeriodName}
          currentUser={currentUser}
          allRoles={allRoles}
          onDataChange={refreshPoGrData}
          {...commonPageProps}
        />
      );
    case Page.FSUpdate:
      return (
        <LazyFSUpdatePage
          key={`fs-update-${currentUser.id}-${selectedPeriodName}`}
          periodName={selectedPeriodName}
          currentUser={currentUser}
          allRoles={allRoles}
          preloadedSnapshot={pagePreloads.fsUpdate}
          onDataChange={refreshPoGrData}
          {...commonPageProps}
        />
      );
    case Page.FSApproval:
      return (
        <LazyFSApprovalPage
          key={`fs-approval-${currentUser.id}-${selectedPeriodName}`}
          periodName={selectedPeriodName}
          currentUser={currentUser}
          allRoles={allRoles}
          preloadedSnapshot={pagePreloads.fsApproval}
          {...commonPageProps}
        />
      );
    case Page.FSRealization:
      return (
        <LazyFSRealizationPage
          key={`fs-realization-${currentUser.id}-${selectedPeriodName}`}
          periodName={selectedPeriodName}
          currentUser={currentUser}
          allRoles={allRoles}
          preloadedSnapshot={pagePreloads.fsRealization}
          headerArchetypeId={selectedArchetypeId}
          headerHuId={selectedHuId}
          {...commonPageProps}
        />
      );
    case Page.Configuration:
      return (
        <LazyConfigurationPage
          onConfigurationChange={onConfigurationChange}
          onUsersListPatch={onUsersListPatch}
          onRolesListPatch={onRolesListPatch}
          currentUser={currentUser}
        />
      );
    case Page.Profile:
      return (
        <LazyProfilePage
          currentUser={currentUser}
          allRoles={allRoles}
          desktopNotificationsEnabled={desktopNotificationsEnabled}
          browserNotificationPermission={browserNotificationPermission}
          onDesktopNotificationsToggle={onDesktopNotificationsToggle}
          onRequestDesktopPermission={onRequestDesktopPermission}
        />
      );
    default:
      return (
        <div className="flex-1 p-4 md:p-8">
          Page &quot;{routePage}&quot; not implemented yet.
        </div>
      );
  }
}

export const AppRouteRenderer = memo(AppRouteRendererComponent);
