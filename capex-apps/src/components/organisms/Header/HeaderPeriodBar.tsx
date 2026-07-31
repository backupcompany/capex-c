import React, { memo, useMemo, useCallback } from 'react';
import { Page } from '@/types';
import type { BudgetPeriod, Archetype, HospitalUnit } from '@/types';
import { Dropdown } from '../../molecules/Dropdown/Dropdown';

const formatHuLabel = (hu: HospitalUnit): string => {
  const code = (hu.code || '').trim();
  return code ? `${code} - ${hu.name}` : hu.name;
};

const PAGES_WITH_ARCHETYPE_FILTER = [Page.BudgetArchetype, Page.BudgetHU];
const PAGES_WITH_HU_FILTER = [Page.BudgetHU];

export type HeaderPeriodBarProps = {
  activePage: Page;
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

export const HeaderPeriodBar = memo(function HeaderPeriodBar({
  activePage,
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
}: HeaderPeriodBarProps) {
  const selectedArchetype = useMemo(
    () => visibleArchetypes.find((a) => a.id === selectedArchetypeId),
    [visibleArchetypes, selectedArchetypeId],
  );
  const selectedHU = useMemo(
    () => visibleHUs.find((u) => u.id === selectedHuId),
    [visibleHUs, selectedHuId],
  );

  const archetypeOptions = useMemo(
    () => visibleArchetypes.map((a) => a.name),
    [visibleArchetypes],
  );
  const huOptions = useMemo(() => visibleHUs.map(formatHuLabel), [visibleHUs]);
  const periodOptions = useMemo(() => allPeriods.map((p) => p.periodName), [allPeriods]);

  const handleArchetypeChange = useCallback(
    (name: string) => onArchetypeChange(name),
    [onArchetypeChange],
  );

  const handleHUChange = useCallback((name: string) => onHUChange(name), [onHUChange]);

  const handleHUOptionHover = useCallback(
    (label: string) => {
      if (!onHUHover) return;
      const hu = visibleHUs.find((u) => formatHuLabel(u) === label || u.name === label);
      if (hu) onHUHover(hu.id);
    },
    [onHUHover, visibleHUs],
  );

  return (
    <div
      data-tour="header-budget-filters"
      className="hidden md:flex items-center gap-2 bg-siloam-bg p-1.5 rounded-xl border border-siloam-border"
    >
      <Dropdown
        options={periodOptions}
        selectedValue={selectedPeriodName}
        onSelect={onPeriodChange}
        className="w-40"
      />
      {PAGES_WITH_ARCHETYPE_FILTER.includes(activePage) ? (
        <Dropdown
          options={
            archetypeOptions.length > 0
              ? archetypeOptions
              : isLoadingBudgetPeriod
                ? ['Loading...']
                : []
          }
          selectedValue={
            selectedArchetype?.name ||
            (isLoadingBudgetPeriod && archetypeOptions.length === 0 ? 'Loading...' : '')
          }
          onSelect={(name) => {
            if (name === 'Loading...') return;
            handleArchetypeChange(name);
          }}
          className="w-48"
          placeholder={isLoadingBudgetPeriod ? 'Loading...' : undefined}
        />
      ) : null}
      {PAGES_WITH_HU_FILTER.includes(activePage) ? (
        <Dropdown
          options={
            huOptions.length > 0 ? huOptions : isLoadingBudgetPeriod ? ['Loading...'] : []
          }
          selectedValue={
            selectedHU
              ? formatHuLabel(selectedHU)
              : isLoadingBudgetPeriod && huOptions.length === 0
                ? 'Loading...'
                : ''
          }
          onSelect={(name) => {
            if (name === 'Loading...') return;
            handleHUChange(name);
          }}
          onOptionHover={(name) => {
            if (name === 'Loading...') return;
            handleHUOptionHover(name);
          }}
          className="w-56"
          placeholder={isLoadingBudgetPeriod ? 'Loading...' : undefined}
        />
      ) : null}
    </div>
  );
});

HeaderPeriodBar.displayName = 'HeaderPeriodBar';
