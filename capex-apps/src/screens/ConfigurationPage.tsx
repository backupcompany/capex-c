'use client';

import React, { useEffect, useCallback, memo, useMemo, useRef } from 'react';
import type { User, UserRole, ProjectPriorityConfig, ChangeSummary } from '@/types';
import type { ConfigSliceKey } from '@/services/configurationApi';
import { useToast } from '@/contexts/ToastContext';
import { useConfigurationPageData } from '@/features/configuration/core/useConfigurationPageData';
import {
  CONFIGURATION_TABS,
  isConfigurationTabReady,
} from '@/features/configuration/core/configurationPageUtils';
import {
  ConfigurationPageShell,
  ConfigurationTabSkeleton,
  ConfigurationTabLoadError,
} from '@/features/configuration/core/ConfigurationPageShell';
import { ConfigurationTabPanels } from '@/features/configuration/core/ConfigurationTabPanels';
import { useConfigurationTab } from '@/features/configuration/core/useConfigurationTab';
import type { ConfigurationUnsavedHandle } from '@/features/configuration/shared/configurationUnsaved';

export interface ConfigurationPageProps {
  onConfigurationChange: () => void;
  onUsersListPatch?: (users: User[]) => void;
  onRolesListPatch?: (roles: UserRole[]) => void;
  currentUser: User;
  setIsPageDirty?: (dirty: boolean) => void;
  setPageActions?: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
}

export const ConfigurationPage = memo(function ConfigurationPage({
  onConfigurationChange,
  onUsersListPatch,
  onRolesListPatch,
  currentUser,
  setIsPageDirty,
  setPageActions,
}: ConfigurationPageProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useConfigurationTab();
  const configErrorToastShownRef = useRef(false);
  const unsavedRef = useRef(new Map<string, ConfigurationUnsavedHandle>());

  const {
    pack: allData,
    partialPack,
    configQuery,
    canRenderShell,
    isInitialLoading,
    isRevalidating,
    refreshSlices,
    prefetchTab,
    patchUsersList: patchUsersInCache,
    patchRolesList: patchRolesInCache,
    patchConfigurationSlices,
    activeTabLoadStatus,
    retryActiveTab,
  } = useConfigurationPageData({ userId: currentUser.id, activeTab });

  const syncUnsavedToShell = useCallback(() => {
    const handles = [...unsavedRef.current.values()];
    const dirty = handles.length > 0;
    setIsPageDirty?.(dirty);
    if (!setPageActions) return;
    setPageActions({
      onSave: async () => {
        for (const h of [...unsavedRef.current.values()]) {
          await h.save();
        }
      },
      onCancel: () => {
        for (const h of [...unsavedRef.current.values()]) {
          h.discard();
        }
        unsavedRef.current.clear();
        setIsPageDirty?.(false);
      },
      getSummary: () => {
        const list = [...unsavedRef.current.values()];
        if (!list.length) return null;
        return {
          title: 'Configuration — unsaved spreadsheet',
          changes: list.map((h) => ({
            item: h.label,
            before: 'Saved on server',
            after: 'Local edits (not saved)',
          })),
        };
      },
    });
  }, [setIsPageDirty, setPageActions]);

  const reportUnsaved = useCallback(
    (key: string, handle: ConfigurationUnsavedHandle | null) => {
      if (handle) unsavedRef.current.set(key, handle);
      else unsavedRef.current.delete(key);
      syncUnsavedToShell();
    },
    [syncUnsavedToShell],
  );

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsavedRef.current.size === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      unsavedRef.current.clear();
      setIsPageDirty?.(false);
    };
  }, [setIsPageDirty]);

  useEffect(() => {
    if (!configQuery.isError) {
      configErrorToastShownRef.current = false;
      return;
    }
    if (canRenderShell || configErrorToastShownRef.current) return;
    configErrorToastShownRef.current = true;
    showToast('Gagal memuat konfigurasi.', 'error');
  }, [configQuery.isError, canRenderShell, showToast]);

  const patchUsersList = useCallback(
    (nextUsers: User[]) => {
      patchUsersInCache(nextUsers);
      onUsersListPatch?.(nextUsers);
    },
    [onUsersListPatch, patchUsersInCache],
  );

  const patchRolesList = useCallback(
    (nextRoles: UserRole[]) => {
      patchRolesInCache(nextRoles);
      onRolesListPatch?.(nextRoles);
    },
    [onRolesListPatch, patchRolesInCache],
  );

  const patchAssetTypeMaster = useCallback(
    (patch: Parameters<typeof patchConfigurationSlices>[0]) => {
      patchConfigurationSlices(patch);
    },
    [patchConfigurationSlices],
  );

  const patchProjectPriorities = useCallback(
    (priorities: ProjectPriorityConfig[]) => {
      patchConfigurationSlices({ projectPriorities: priorities });
    },
    [patchConfigurationSlices],
  );

  const refreshThenNotifyApp = useCallback(
    async (slices: ConfigSliceKey[]) => {
      await refreshSlices(slices);
      onConfigurationChange();
    },
    [onConfigurationChange, refreshSlices],
  );

  const refreshOnly = useCallback(
    (slices: ConfigSliceKey[]) => {
      void refreshSlices(slices);
    },
    [refreshSlices],
  );

  const tabReady = isConfigurationTabReady(partialPack, activeTab);

  const handleTabChange = useCallback(
    (tab: string) => {
      if (unsavedRef.current.size > 0) {
        const labels = [...unsavedRef.current.values()].map((h) => h.label).join(', ');
        if (
          !window.confirm(
            `Ada perubahan belum disimpan (${labels}). Pindah tab akan membuang edit lokal. Lanjut?`,
          )
        ) {
          return;
        }
        for (const h of unsavedRef.current.values()) h.discard();
        unsavedRef.current.clear();
        setIsPageDirty?.(false);
      }
      setActiveTab(tab as typeof activeTab);
    },
    [setActiveTab, setIsPageDirty],
  );

  const handleRetryActiveTab = useCallback(() => {
    void retryActiveTab();
  }, [retryActiveTab]);

  const shellProps = useMemo(
    () => ({
      activeTab,
      tabs: CONFIGURATION_TABS,
      onTabChange: handleTabChange,
      onTabHover: prefetchTab,
      isRevalidating: !isInitialLoading && canRenderShell ? isRevalidating : undefined,
    }),
    [activeTab, handleTabChange, prefetchTab, isInitialLoading, canRenderShell, isRevalidating],
  );

  const tabContent = useMemo(() => {
    if (activeTabLoadStatus === 'error') {
      return <ConfigurationTabLoadError onRetry={handleRetryActiveTab} />;
    }
    if (!tabReady) {
      return <ConfigurationTabSkeleton />;
    }
    return (
      <ConfigurationTabPanels
        activeTab={activeTab}
        pack={allData}
        currentUser={currentUser}
        patchUsersList={patchUsersList}
        patchRolesList={patchRolesList}
        patchAssetTypeMaster={patchAssetTypeMaster}
        patchProjectPriorities={patchProjectPriorities}
        refreshOnly={refreshOnly}
        refreshThenNotifyApp={refreshThenNotifyApp}
        onUnsavedReport={reportUnsaved}
      />
    );
  }, [
    activeTabLoadStatus,
    handleRetryActiveTab,
    tabReady,
    activeTab,
    allData,
    currentUser,
    patchUsersList,
    patchRolesList,
    patchAssetTypeMaster,
    patchProjectPriorities,
    refreshOnly,
    refreshThenNotifyApp,
    reportUnsaved,
  ]);

  if (isInitialLoading || !canRenderShell) {
    return (
      <ConfigurationPageShell {...shellProps}>
        <ConfigurationTabSkeleton />
      </ConfigurationPageShell>
    );
  }

  return <ConfigurationPageShell {...shellProps}>{tabContent}</ConfigurationPageShell>;
});
