import React, { memo } from 'react';
import type { Notification, BudgetPeriod, Archetype, HospitalUnit } from '@/types';
import { Page } from '@/types';
import { HeaderPeriodBar } from './HeaderPeriodBar';
import { HeaderNotificationShell } from './HeaderNotificationShell';

const BurgerIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export type HeaderProps = {
  activePage: Page;
  onMenuClick: () => void;
  notifications?: Notification[];
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onNavigate?: (page: Page) => void;
  showFilters: boolean;
  allPeriods: BudgetPeriod[];
  selectedPeriodName: string;
  onPeriodChange: (name: string) => void;
  visibleArchetypes: Archetype[];
  selectedArchetypeId: string | null;
  onArchetypeChange: (name: string) => void;
  visibleHUs: HospitalUnit[];
  selectedHuId: string | null;
  onHUChange: (name: string) => void;
  onHUHover?: (huId: string) => void;
  isLoadingBudgetPeriod?: boolean;
};

export const Header = memo(function Header({
  activePage,
  onMenuClick,
  notifications = [],
  onMarkAsRead = () => {},
  onMarkAllAsRead = () => {},
  onNavigate = () => {},
  showFilters,
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
  isLoadingBudgetPeriod = false,
}: HeaderProps) {
  return (
    <header className="flex-shrink-0 bg-siloam-surface border-b border-siloam-border px-4 py-3 md:px-6 flex justify-between items-center sticky top-0 z-30">
      <div className="flex items-center">
        <button type="button"
          className="p-2 mr-2 md:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <BurgerIcon />
        </button>
        <h1 className="text-xl md:text-2xl font-bold text-siloam-text-primary">{activePage}</h1>
      </div>
      <div className="flex items-center gap-4">
        {showFilters ? (
          <HeaderPeriodBar
            activePage={activePage}
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
        ) : null}
        <HeaderNotificationShell
          notifications={notifications}
          onMarkAsRead={onMarkAsRead}
          onMarkAllAsRead={onMarkAllAsRead}
          onNavigate={onNavigate}
        />
      </div>
    </header>
  );
});

Header.displayName = 'Header';
