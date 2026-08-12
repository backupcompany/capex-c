'use client';

import React, { Suspense } from 'react';
import { Sidebar } from '@/components/organisms/Sidebar/Sidebar';
import { UnsavedChangesModal } from '@/components/organisms/UnsavedChangesModal/UnsavedChangesModal';
import { Toast } from '@/components/atoms/Toast/Toast';
import { AuthSessionSync } from '@/components/auth/AuthSessionSync';
import { SessionExpiryWarning } from '@/components/auth/SessionExpiryWarning';
import { AppRouteRenderer, type AppRouteRendererProps } from '@/components/app-shell/AppRouteRenderer';
import { AppShellChrome } from '@/components/app-shell/AppShellChrome';
import { APP_SHELL_PAGES_WITH_FILTERS } from '@/components/app-shell/appShellPagesWithFilters';
import { BackendServiceBanner } from '@/components/app-shell/BackendServiceBanner';
import { RouteScreenFallback } from '@/components/app-shell/RouteScreenFallback';
import { ToastProvider, type ShowToastOptions } from '@/contexts/ToastContext';
import type { Page, ChangeSummary, User, UserRole, BudgetPeriod, Archetype, HospitalUnit, Notification } from '@/types';
import type { NavItemConfig } from '@/constants';

type ToastState = {
  id: number;
  message: string;
  type: 'success' | 'error';
  title?: string;
} | null;

export type AppAuthenticatedLayoutProps = {
  showToast: (message: string, type?: 'success' | 'error', options?: ShowToastOptions) => void;
  onForceLogout: (options?: { skipBackend?: boolean }) => void | Promise<void>;
  routePage: Page;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  sidebarNavRevision: number;
  currentUser: User;
  visibleNavItems: NavItemConfig[];
  showProfileNav: boolean;
  allRoles: UserRole[];
  shellPermissionsReady: boolean;
  onNavigate: (page: Page) => void;
  onNavItemPrefetch: (page: Page) => void;
  onLogout: (options?: { skipBackend?: boolean }) => void | Promise<void>;
  notifications: Notification[];
  onMarkNotificationAsRead: (id: string) => void;
  onMarkAllNotificationsAsRead: () => void;
  allPeriods: BudgetPeriod[];
  selectedPeriodName: string;
  onPeriodChange: (name: string) => void;
  visibleArchetypes: Archetype[];
  selectedArchetypeId: string | null;
  onArchetypeChange: (archetypeName: string) => void;
  visibleHUs: HospitalUnit[];
  selectedHuId: string | null;
  onHUChange: (huName: string) => void;
  onHUHover: (huId: string) => void;
  isLoadingBudgetPeriod: boolean;
  routeRendererProps: Omit<AppRouteRendererProps, 'routePage' | 'currentUser'>;
  pendingNavigation: Page | null;
  changeSummary: ChangeSummary | null;
  onModalClose: () => void;
  onModalSave: () => Promise<void>;
  onModalDiscard: () => void;
  toast: ToastState;
  dismissToast: () => void;
  /** True when app bootstrap API failed — shell still renders. */
  backendServiceDown?: boolean;
};

export function AppAuthenticatedLayout({
  showToast,
  onForceLogout,
  routePage,
  isSidebarOpen,
  setIsSidebarOpen,
  sidebarNavRevision,
  currentUser,
  visibleNavItems,
  showProfileNav,
  allRoles,
  shellPermissionsReady,
  onNavigate,
  onNavItemPrefetch,
  onLogout,
  notifications,
  onMarkNotificationAsRead,
  onMarkAllNotificationsAsRead,
  allPeriods,
  selectedPeriodName,
  onPeriodChange,
  visibleArchetypes,
  selectedArchetypeId,
  onArchetypeChange,
  visibleHUs,
  selectedHuId,
  onHUChange,
  onHUHover,
  isLoadingBudgetPeriod,
  routeRendererProps,
  pendingNavigation,
  changeSummary,
  onModalClose,
  onModalSave,
  onModalDiscard,
  toast,
  dismissToast,
  backendServiceDown = false,
}: AppAuthenticatedLayoutProps) {
  return (
    <ToastProvider showToast={showToast}>
      <AuthSessionSync onForceLogout={onForceLogout} />
      <SessionExpiryWarning onSessionExpired={() => void onForceLogout({ skipBackend: true })} />
      <div className="flex h-screen bg-siloam-bg text-siloam-text-primary font-inter">
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <Sidebar
          key={`sidebar-nav-${sidebarNavRevision}`}
          activePage={routePage}
          onNavigate={onNavigate}
          onNavItemPrefetch={onNavItemPrefetch}
          currentUser={currentUser}
          visibleNavItems={visibleNavItems}
          showProfileNav={showProfileNav}
          allRoles={allRoles}
          navLoading={!shellPermissionsReady}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onLogout={onLogout}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <AppShellChrome
            activePage={routePage}
            onMenuClick={() => setIsSidebarOpen(true)}
            notifications={notifications}
            onMarkAsRead={onMarkNotificationAsRead}
            onMarkAllAsRead={onMarkAllNotificationsAsRead}
            onNavigate={onNavigate}
            showFilters={APP_SHELL_PAGES_WITH_FILTERS.includes(routePage)}
            allPeriods={allPeriods}
            selectedPeriodName={selectedPeriodName}
            onPeriodChange={onPeriodChange}
            visibleArchetypes={visibleArchetypes}
            selectedArchetypeId={selectedArchetypeId}
            onArchetypeChange={onArchetypeChange}
            visibleHUs={visibleHUs}
            selectedHuId={selectedHuId}
            onHUChange={onHUChange}
            onHUHover={onHUHover}
            isLoadingBudgetPeriod={isLoadingBudgetPeriod}
          />

          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            {backendServiceDown ? <BackendServiceBanner /> : null}
            <Suspense fallback={<RouteScreenFallback routePage={routePage} />}>
              <AppRouteRenderer routePage={routePage} currentUser={currentUser} {...routeRendererProps} />
            </Suspense>
          </main>
        </div>

        <UnsavedChangesModal
          isOpen={!!pendingNavigation}
          onClose={onModalClose}
          onSave={onModalSave}
          onDiscard={onModalDiscard}
          changeSummary={changeSummary}
        />
        {toast ? (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            title={toast.title}
            onClose={dismissToast}
          />
        ) : null}
      </div>
    </ToastProvider>
  );
}
