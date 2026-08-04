'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { Page } from '@/types';
import type { Archetype, BudgetMultiYear, BudgetPeriod, HospitalUnit, User } from '@/types';
import * as budgetService from '@/services/budgetService';
import { warmRouteOnPeriodChange } from '@/lib/navigation/routeWarmPolicy';
import { pickDefaultBudgetPeriodNameForYear } from '@/lib/appShell/periodSelectionUtils';
import { readInitialPeriodShellState, writePeriodShellCache } from '@/lib/periodSelectionCache';
import { prefetchBudgetSiloamPeriod } from '@/lib/prefetchBudgetSiloamPeriod';
import {
  findHuInBudgetPeriod,
  mergeBudgetPeriodMasterStructure,
  readBudgetHuFilterSelection,
  readInitialBudgetPeriodForShell,
  resolveFullBudgetPeriodForDisplay,
  clearBudgetHuFilterSelection,
  writeBudgetHuFilterSelection,
} from '@/lib/budgetHuDiskCache';
import {
  prefetchBudgetHuPage,
  prefetchBudgetHuUnitsIdle,
} from '@/hooks/queries/warmBudgetHuCache';
import { routeNeedsPeriodStructure } from '@/components/app-shell/appShellPagesWithFilters';
import { pathnameToPage } from '@/lib/pageRoutes';
import { readCachedAuthUser } from '@/lib/authSessionCache';
import {
  readExecutiveDashboardFilter,
  writeExecutiveDashboardFilter,
} from '@/lib/executiveDashboardDiskCache';

const initialPeriodShell = readInitialPeriodShellState();

type PermissionsLike = {
  userScopes: {
    all: boolean;
    archetypes: Set<string>;
    archetypeIds: Set<string>;
    hus: Set<string>;
    huIds: Set<string>;
  };
};

export type UseAppPeriodFiltersOptions = {
  authProbeComplete: boolean;
  currentUser: User | null;
  routePage: Page;
  permissions: PermissionsLike;
  queryClient: QueryClient;
  initialAllPeriods: BudgetPeriod[];
  bootstrapMultiYears: BudgetMultiYear[] | undefined;
  dataInitialized: boolean;
};

export function useAppPeriodFilters({
  authProbeComplete,
  currentUser,
  routePage,
  permissions,
  queryClient,
  initialAllPeriods,
  bootstrapMultiYears,
  dataInitialized,
}: UseAppPeriodFiltersOptions) {
  const [allPeriods, setAllPeriods] = useState<BudgetPeriod[]>(() =>
    initialAllPeriods.length ? initialAllPeriods : initialPeriodShell.allPeriods,
  );
  const [selectedPeriodName, setSelectedPeriodName] = useState<string>(initialPeriodShell.selectedPeriodName);
  const [currentBudgetPeriod, setCurrentBudgetPeriod] = useState<BudgetPeriod | null>(() =>
    readInitialBudgetPeriodForShell(),
  );
  const [isLoadingBudgetPeriod, setIsLoadingBudgetPeriod] = useState(false);
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string | null>(() => {
    const pn = initialPeriodShell.selectedPeriodName;
    if (typeof window !== 'undefined' && pn) {
      const onExecutive = pathnameToPage(window.location.pathname) === Page.ExecutiveSummary;
      const uid = readCachedAuthUser()?.id;
      if (onExecutive && uid) {
        return readExecutiveDashboardFilter(pn, uid)?.archetypeId ?? null;
      }
      return readBudgetHuFilterSelection(pn)?.archetypeId ?? null;
    }
    return null;
  });
  const [selectedHuId, setSelectedHuId] = useState<string | null>(() => {
    const pn = initialPeriodShell.selectedPeriodName;
    return pn ? (readBudgetHuFilterSelection(pn)?.huId ?? null) : null;
  });

  const pinnedFilterRef = useRef(readBudgetHuFilterSelection(initialPeriodShell.selectedPeriodName));
  const filterUserTouchedRef = useRef(false);
  const ceoDashboardAllNetworksRef = useRef(false);
  const prevRoutePageRef = useRef<Page | null>(null);
  const lastHuNeighborPrefetchKeyRef = useRef('');

  useEffect(() => {
    const enteredCeo =
      routePage === Page.ExecutiveSummary &&
      prevRoutePageRef.current !== null &&
      prevRoutePageRef.current !== Page.ExecutiveSummary;
    if (enteredCeo) {
      filterUserTouchedRef.current = false;
      const saved =
        currentUser?.id && selectedPeriodName.trim()
          ? readExecutiveDashboardFilter(selectedPeriodName, currentUser.id)
          : null;
      ceoDashboardAllNetworksRef.current = !saved?.archetypeId;
      setSelectedArchetypeId(saved?.archetypeId ?? null);
    }
    prevRoutePageRef.current = routePage;
  }, [routePage, currentUser?.id, selectedPeriodName]);

  const syncPeriodSelectionFromLists = useCallback((multiYears: BudgetMultiYear[], periods: BudgetPeriod[]) => {
    const currentYear = new Date().getFullYear();
    const currentMultiYear = multiYears.find((my) => currentYear >= my.startYear && currentYear <= my.endYear);
    const preferredMultiYearName = currentMultiYear?.name ?? null;

    setSelectedPeriodName((prev) => {
      if (periods.length === 0) return prev;
      if (prev && periods.some((p) => p.periodName === prev)) return prev;
      return pickDefaultBudgetPeriodNameForYear(periods, currentYear, preferredMultiYearName);
    });
  }, []);

  useEffect(() => {
    const fetchPeriodData = async () => {
      if (!authProbeComplete || !currentUser?.id) {
        if (authProbeComplete) {
          setCurrentBudgetPeriod(null);
          setIsLoadingBudgetPeriod(false);
        }
        return;
      }
      if (!selectedPeriodName) {
        setCurrentBudgetPeriod(null);
        setIsLoadingBudgetPeriod(false);
        return;
      }

      const uid = currentUser.id;
      const needsStructure = routeNeedsPeriodStructure(routePage);
      const cachedFull = resolveFullBudgetPeriodForDisplay(
        selectedPeriodName,
        uid,
        currentBudgetPeriod,
      );
      const hasCachedFull = !!cachedFull;

      if (hasCachedFull) {
        setCurrentBudgetPeriod(cachedFull);
      }

      if (!needsStructure) {
        setIsLoadingBudgetPeriod(false);
        return;
      }

      if (!hasCachedFull) {
        setIsLoadingBudgetPeriod(true);
      }

      try {
        const structure = await budgetService.getBudgetPeriodStructure(selectedPeriodName);
        if (structure?.archetypes?.length) {
          setCurrentBudgetPeriod((prev) =>
            mergeBudgetPeriodMasterStructure(
              hasCachedFull ? (prev ?? cachedFull!) : null,
              structure.archetypes,
              selectedPeriodName,
            ),
          );
        } else if (!hasCachedFull) {
          setCurrentBudgetPeriod(null);
        }
      } catch (error) {
        console.error('Failed to fetch budget period structure:', error);
        if (!hasCachedFull) {
          setCurrentBudgetPeriod(null);
        }
      } finally {
        setIsLoadingBudgetPeriod(false);
      }
    };
    void fetchPeriodData();
  }, [authProbeComplete, selectedPeriodName, currentUser?.id, queryClient, routePage]);

  useEffect(() => {
    if (!selectedPeriodName && allPeriods.length === 0) return;
    writePeriodShellCache({
      selectedPeriodName,
      periodNames: allPeriods.map((p) => p.periodName),
    });
  }, [selectedPeriodName, allPeriods]);

  useEffect(() => {
    if (!authProbeComplete || !dataInitialized) return;
    if (selectedPeriodName.trim()) return;
    if (allPeriods.length === 0) return;
    syncPeriodSelectionFromLists(bootstrapMultiYears ?? [], allPeriods);
  }, [
    authProbeComplete,
    dataInitialized,
    selectedPeriodName,
    allPeriods,
    bootstrapMultiYears,
    syncPeriodSelectionFromLists,
  ]);

  const handlePeriodChange = useCallback(
    (name: string) => {
      setSelectedPeriodName(name);
      filterUserTouchedRef.current = false;
      if (routePage === Page.ExecutiveSummary) {
        const saved =
          currentUser?.id && name.trim()
            ? readExecutiveDashboardFilter(name, currentUser.id)
            : null;
        ceoDashboardAllNetworksRef.current = !saved?.archetypeId;
        pinnedFilterRef.current = null;
        setSelectedArchetypeId(saved?.archetypeId ?? null);
        setSelectedHuId(null);
      } else {
        ceoDashboardAllNetworksRef.current = false;
        pinnedFilterRef.current = readBudgetHuFilterSelection(name);
        const pin = pinnedFilterRef.current;
        setSelectedArchetypeId(pin?.archetypeId ?? null);
        setSelectedHuId(pin?.huId ?? null);
      }
      const pin = pinnedFilterRef.current;
      if (currentUser?.id) {
        warmRouteOnPeriodChange({
          queryClient,
          routePage,
          periodName: name,
          userId: currentUser.id,
          user: currentUser,
          pinArchetypeId:
            routePage === Page.ExecutiveSummary ? null : (pin?.archetypeId ?? null),
          pinHuId: routePage === Page.ExecutiveSummary ? null : (pin?.huId ?? null),
        });
      } else if (routePage === Page.BudgetPeriod || routePage === Page.BudgetArchetype) {
        prefetchBudgetSiloamPeriod(queryClient, name, undefined);
      }
    },
    [currentUser, queryClient, routePage],
  );

  const visibleArchetypes = useMemo((): Archetype[] => {
    if (!currentBudgetPeriod) return [];
    if (permissions.userScopes.all) return currentBudgetPeriod.archetypes;

    const relevantArchetypeNames = new Set(permissions.userScopes.archetypes);
    const relevantArchetypeIds = new Set(permissions.userScopes.archetypeIds);
    const relevantHuNames = permissions.userScopes.hus;
    const relevantHuIds = permissions.userScopes.huIds;
    currentBudgetPeriod.archetypes.forEach((arch) => {
      if (arch.units.some((u) => relevantHuNames.has(u.name) || relevantHuIds.has(u.id))) {
        relevantArchetypeNames.add(arch.name);
        relevantArchetypeIds.add(arch.id);
      }
    });
    return currentBudgetPeriod.archetypes.filter(
      (arch) => relevantArchetypeIds.has(arch.id) || relevantArchetypeNames.has(arch.name),
    );
  }, [currentBudgetPeriod, permissions]);

  const visibleHUs = useMemo((): HospitalUnit[] => {
    if (!selectedArchetypeId || !currentBudgetPeriod) return [];
    const archetype = currentBudgetPeriod.archetypes.find((a) => a.id === selectedArchetypeId);
    if (!archetype) return [];
    const units =
      permissions.userScopes.all ||
      permissions.userScopes.archetypes.has(archetype.name) ||
      permissions.userScopes.archetypeIds.has(archetype.id)
        ? archetype.units
        : archetype.units.filter(
            (u) => permissions.userScopes.hus.has(u.name) || permissions.userScopes.huIds.has(u.id),
          );
    const list = [...units].sort((a, b) =>
      String(a.code || a.name).localeCompare(String(b.code || b.name), 'id', {
        numeric: true,
        sensitivity: 'base',
      }),
    );
    if (selectedHuId && !list.some((u) => String(u.id) === String(selectedHuId))) {
      for (const arch of currentBudgetPeriod.archetypes) {
        const hu = arch.units.find((u) => String(u.id) === String(selectedHuId));
        if (hu) {
          list.unshift(hu);
          break;
        }
      }
    }
    return list;
  }, [selectedArchetypeId, currentBudgetPeriod, permissions, selectedHuId]);

  useEffect(() => {
    if (!currentBudgetPeriod) return;

    const pn = selectedPeriodName.trim();

    if (
      routePage === Page.ExecutiveSummary &&
      ceoDashboardAllNetworksRef.current &&
      !filterUserTouchedRef.current
    ) {
      if (selectedArchetypeId != null) setSelectedArchetypeId(null);
      return;
    }

    if (filterUserTouchedRef.current) {
      if (isLoadingBudgetPeriod) return;
      const allowAllNetworksOnCeo =
        routePage === Page.ExecutiveSummary &&
        ceoDashboardAllNetworksRef.current &&
        !selectedArchetypeId;
      if (visibleArchetypes.length > 0) {
        if (
          !allowAllNetworksOnCeo &&
          (!selectedArchetypeId ||
            !visibleArchetypes.some((a) => String(a.id) === String(selectedArchetypeId)))
        ) {
          setSelectedArchetypeId(visibleArchetypes[0].id);
        }
      }
      if (visibleHUs.length > 0) {
        if (!selectedHuId || !visibleHUs.some((u) => String(u.id) === String(selectedHuId))) {
          setSelectedHuId(visibleHUs[0].id);
        }
      }
      return;
    }

    const pin =
      (pinnedFilterRef.current?.periodName === pn ? pinnedFilterRef.current : null) ??
      (pn ? readBudgetHuFilterSelection(pn) : null);

    if (pin?.huId || pin?.huCode) {
      const found = findHuInBudgetPeriod(currentBudgetPeriod, pin.huId, pin.huCode);
      if (found) {
        if (String(selectedArchetypeId) !== String(found.archetypeId)) {
          setSelectedArchetypeId(found.archetypeId);
        }
        if (String(selectedHuId) !== String(found.huId)) {
          setSelectedHuId(found.huId);
        }
        pinnedFilterRef.current = {
          periodName: pn,
          archetypeId: found.archetypeId,
          huId: found.huId,
          huCode: found.huCode || pin.huCode,
        };
        return;
      }

      if (pin.archetypeId && String(selectedArchetypeId) !== String(pin.archetypeId)) {
        setSelectedArchetypeId(pin.archetypeId);
      }
      if (pin.huId && String(selectedHuId) !== String(pin.huId)) {
        setSelectedHuId(pin.huId);
      }
      return;
    }

    if (isLoadingBudgetPeriod) return;

    const allowAllNetworksOnCeo =
      routePage === Page.ExecutiveSummary &&
      ceoDashboardAllNetworksRef.current &&
      !selectedArchetypeId;

    if (visibleArchetypes.length > 0) {
      if (
        !allowAllNetworksOnCeo &&
        (!selectedArchetypeId ||
          !visibleArchetypes.some((a) => String(a.id) === String(selectedArchetypeId)))
      ) {
        setSelectedArchetypeId(visibleArchetypes[0].id);
      }
    }
    if (visibleHUs.length > 0) {
      if (!selectedHuId || !visibleHUs.some((u) => String(u.id) === String(selectedHuId))) {
        setSelectedHuId(visibleHUs[0].id);
      }
    }
  }, [
    currentBudgetPeriod,
    isLoadingBudgetPeriod,
    selectedPeriodName,
    selectedArchetypeId,
    selectedHuId,
    visibleArchetypes,
    visibleHUs,
    routePage,
  ]);

  useEffect(() => {
    if (routePage !== Page.BudgetHU) return;
    if (!currentUser?.id || !selectedPeriodName.trim() || visibleHUs.length === 0) return;
    const prefetchKey = `${selectedPeriodName}:${selectedHuId ?? ''}:${visibleHUs.map((u) => u.id).join('\u0001')}`;
    if (lastHuNeighborPrefetchKeyRef.current === prefetchKey) return;
    lastHuNeighborPrefetchKeyRef.current = prefetchKey;
    prefetchBudgetHuUnitsIdle(
      queryClient,
      selectedPeriodName,
      currentUser.id,
      visibleHUs.map((u) => u.id),
      selectedHuId,
    );
  }, [routePage, currentUser?.id, selectedPeriodName, visibleHUs, selectedHuId, queryClient]);

  useEffect(() => {
    if (isLoadingBudgetPeriod || !currentBudgetPeriod) return;
    if (!selectedPeriodName.trim() || !selectedArchetypeId || !selectedHuId) return;

    const pin = pinnedFilterRef.current;
    if (
      pin &&
      pin.periodName === selectedPeriodName.trim() &&
      String(pin.huId) !== String(selectedHuId) &&
      !filterUserTouchedRef.current
    ) {
      return;
    }

    const huMeta =
      findHuInBudgetPeriod(currentBudgetPeriod, selectedHuId, null) ??
      (visibleHUs.find((u) => String(u.id) === String(selectedHuId))
        ? {
            archetypeId: selectedArchetypeId,
            huId: selectedHuId,
            huCode: String(visibleHUs.find((u) => String(u.id) === String(selectedHuId))?.code ?? ''),
          }
        : null);
    if (!huMeta) return;

    writeBudgetHuFilterSelection(
      selectedPeriodName,
      selectedArchetypeId,
      selectedHuId,
      huMeta.huCode,
    );
    pinnedFilterRef.current = {
      periodName: selectedPeriodName.trim(),
      archetypeId: selectedArchetypeId,
      huId: selectedHuId,
      huCode: huMeta.huCode,
    };
  }, [
    selectedPeriodName,
    selectedArchetypeId,
    selectedHuId,
    isLoadingBudgetPeriod,
    currentBudgetPeriod,
    visibleHUs,
  ]);

  const handleExecutiveArchetypeChange = useCallback(
    (archetypeId: string) => {
      filterUserTouchedRef.current = true;
      const trimmed = archetypeId.trim();
      const nextId = trimmed || null;
      if (currentUser?.id && selectedPeriodName.trim()) {
        writeExecutiveDashboardFilter(selectedPeriodName, currentUser.id, nextId);
      }
      if (!trimmed) {
        ceoDashboardAllNetworksRef.current = true;
        setSelectedArchetypeId(null);
        return;
      }
      ceoDashboardAllNetworksRef.current = false;
      setSelectedArchetypeId(trimmed);
    },
    [currentUser?.id, selectedPeriodName],
  );

  const handleArchetypeChange = useCallback(
    (archetypeName: string) => {
      const archetype = visibleArchetypes.find((a) => a.name === archetypeName);
      const newArchetypeId = archetype ? archetype.id : null;
      filterUserTouchedRef.current = true;
      ceoDashboardAllNetworksRef.current = false;
      if (newArchetypeId !== selectedArchetypeId) {
        setSelectedHuId(null);
        pinnedFilterRef.current = null;
        clearBudgetHuFilterSelection();
      }
      setSelectedArchetypeId(newArchetypeId);
    },
    [visibleArchetypes, selectedArchetypeId],
  );

  const formatHuLabel = useCallback((hu: { name: string; code?: string | null }) => {
    const code = (hu.code || '').trim();
    return code ? `${code} - ${hu.name}` : hu.name;
  }, []);

  const handleHUChange = useCallback(
    (huName: string) => {
      const hu = visibleHUs.find((u) => u.name === huName || formatHuLabel(u) === huName);
      filterUserTouchedRef.current = true;
      if (hu) {
        setSelectedHuId(hu.id);
        pinnedFilterRef.current = {
          periodName: selectedPeriodName.trim(),
          archetypeId: selectedArchetypeId || '',
          huId: hu.id,
          huCode: hu.code,
        };
        if (selectedPeriodName.trim() && selectedArchetypeId) {
          writeBudgetHuFilterSelection(selectedPeriodName, selectedArchetypeId, hu.id, hu.code);
        }
        if (currentUser?.id && selectedPeriodName.trim()) {
          void prefetchBudgetHuPage(queryClient, selectedPeriodName, currentUser.id, {
            hospitalUnitId: hu.id,
          });
        }
      } else {
        setSelectedHuId(null);
      }
    },
    [visibleHUs, formatHuLabel, selectedPeriodName, selectedArchetypeId, currentUser?.id, queryClient],
  );

  const handleHUHoverPrefetch = useCallback(
    (huId: string) => {
      if (!currentUser?.id || !selectedPeriodName.trim() || !huId.trim()) return;
      void prefetchBudgetHuPage(queryClient, selectedPeriodName, currentUser.id, {
        hospitalUnitId: huId,
      });
    },
    [currentUser?.id, selectedPeriodName, queryClient],
  );

  return {
    allPeriods,
    setAllPeriods,
    selectedPeriodName,
    currentBudgetPeriod,
    setCurrentBudgetPeriod,
    isLoadingBudgetPeriod,
    selectedArchetypeId,
    selectedHuId,
    visibleArchetypes,
    visibleHUs,
    syncPeriodSelectionFromLists,
    handlePeriodChange,
    handleExecutiveArchetypeChange,
    handleArchetypeChange,
    handleHUChange,
    handleHUHoverPrefetch,
  };
}
