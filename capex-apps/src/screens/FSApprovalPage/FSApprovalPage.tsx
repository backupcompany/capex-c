'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { User, UserRole, ChangeSummary, Page, FSConclusion, FINAL_FS_APPROVAL_CONCLUSIONS } from '../../types';
import * as fsService from '../../services/fsService';
import * as budgetService from '../../services/budgetService';
import * as taskService from '../../services/taskService';
import { usePermissions } from '../../hooks/usePermissions';
import { TaskFilterPanel } from '../../components/organisms/TaskFilterPanel/TaskFilterPanel';
import { Dropdown } from '../../components/molecules/Dropdown/Dropdown';
import { FSApprovalStatusModal } from '../../components/organisms/FSApprovalStatusModal/FSApprovalStatusModal';
import type { EnrichedFS } from '../../hooks/queries/fetchFsApprovalPageData';
import { type FsApprovalSortOption } from './fsApprovalHelpers';
import { useFsApprovalFilterState } from './hooks/useFsApprovalFilterState';
import { useFsApprovalPageData } from './hooks/useFsApprovalPageData';
import { FSApprovalTableBlock } from './FSApprovalTableBlock';
import { FsApprovalPaybackFilter } from './FsApprovalPaybackFilter';
import { buildFsApprovalColumns } from './buildFsApprovalColumns';
import {
  readFsApprovalFocusFromSearchParams,
  stripDeepLinkParamsFromUrl,
} from '@/lib/screenRef';

type FsEditEntry = { original: EnrichedFS; current: EnrichedFS };

const SORT_OPTIONS: { label: string; value: FsApprovalSortOption }[] = [
  { label: 'Project Name (A-Z)', value: 'projectName_asc' },
  { label: 'Payback in Month (Low → High)', value: 'paybackPeriod_asc' },
  { label: 'Payback in Month (High → Low)', value: 'paybackPeriod_desc' },
  { label: 'Amount (Highest First)', value: 'amount_desc' },
  { label: 'Amount (Lowest First)', value: 'amount_asc' },
];

interface FSApprovalPageProps {
  periodName: string;
  currentUser: User;
  allRoles: UserRole[];
  preloadedSnapshot?: { periodName: string; allFS?: EnrichedFS[] } | null;
  setIsPageDirty: (isDirty: boolean) => void;
  setPageActions: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const FSApprovalPage: React.FC<FSApprovalPageProps> = ({
  periodName,
  currentUser,
  allRoles,
  preloadedSnapshot: _preloadedSnapshot,
  setIsPageDirty,
  setPageActions,
  showToast,
}) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.FSApproval, 'view');
  const canEdit = permissions.canOperateOnPage(Page.FSApproval, 'edit');

  const [editMap, setEditMap] = useState<Map<string, FsEditEntry>>(new Map());
  const isDirty = editMap.size > 0;

  const [statusModalFs, setStatusModalFs] = useState<EnrichedFS | null>(null);
  const emailLinkFocus = searchParams.get('focus');

  const filterState = useFsApprovalFilterState(periodName);
  const {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    isSearchStaging,
    selectedArchetypes,
    setSelectedArchetypes,
    selectedHUs,
    setSelectedHUs,
    selectedCategories,
    setSelectedCategories,
    paybackMin,
    setPaybackMin,
    paybackMax,
    setPaybackMax,
    paybackMinActive,
    setPaybackMinActive,
    paybackMaxActive,
    setPaybackMaxActive,
    sortBy,
    setSortBy,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    resetLocalFilters,
  } = filterState;

  const pageData = useFsApprovalPageData({
    periodName,
    userId: currentUser.id,
    canView,
    userScopes: permissions.userScopes,
    debouncedSearch,
    isSearchStaging,
    selectedArchetypes,
    selectedHUs,
    selectedCategories,
    paybackMin,
    paybackMax,
    paybackMinActive,
    paybackMaxActive,
    sortBy,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    showToast,
  });

  const {
    tableQuery,
    serverRows,
    filterOptions,
    totalCount,
    totalPages,
    isBlockingLoad,
    showTableBusy,
    footerTotalCount,
    showPagination,
    invalidateFsApprovalQueries,
  } = pageData;

  useEffect(() => {
    setIsPageDirty(isDirty);
  }, [isDirty, setIsPageDirty]);

  useEffect(() => {
    setEditMap(new Map());
  }, [periodName]);

  useEffect(() => {
    const focusFsId = readFsApprovalFocusFromSearchParams(searchParams);
    if (!focusFsId) return;
    setSearchTerm(focusFsId);
    const cleanPath = stripDeepLinkParamsFromUrl(
      window.location.pathname,
      window.location.search,
    );
    router.replace(cleanPath);
  }, [searchParams, setSearchTerm, router]);

  const paginatedData = useMemo(
    () => serverRows.map((row) => editMap.get(row.id)?.current ?? row),
    [serverRows, editMap],
  );

  const handleStatusModalConfirm = useCallback(
    (status: FSConclusion, followUpAction: string) => {
      if (!statusModalFs) return;
      const sourceRow = serverRows.find((r) => r.id === statusModalFs.id) ?? statusModalFs;
      setEditMap((prev) => {
        const next = new Map(prev);
        const original = prev.get(sourceRow.id)?.original ?? sourceRow;
        next.set(sourceRow.id, {
          original,
          current: { ...original, conclusion: status, followUpAction: followUpAction || null },
        });
        return next;
      });
      setStatusModalFs(null);
      showToast('Status diperbarui. Klik Save Changes untuk menyimpan.', 'success');
    },
    [statusModalFs, serverRows, showToast],
  );

  const handleSave = useCallback(async () => {
    const changedFS = [...editMap.values()]
      .filter(
        (entry) =>
          entry.original.conclusion !== entry.current.conclusion ||
          (entry.original.followUpAction || '') !== (entry.current.followUpAction || ''),
      )
      .map((entry) => entry.current);

    if (changedFS.length === 0) {
      showToast('No changes to save.', 'success');
      setEditMap(new Map());
      return;
    }

    try {
      await Promise.all(
        changedFS.map((fs) => {
          const { archetypeName, huName, projectName, capexCategoryName, ...fsUpdates } = fs;
          return fsService.updateFSProposal(fs.id, fsUpdates, {
            userId: currentUser.id,
            permissionContext: 'FS Approval',
          });
        }),
      );

      const fsWithNewApprovalDecision = changedFS.filter((fs) => {
        const original = editMap.get(fs.id)?.original;
        if (!original || original.conclusion === fs.conclusion) return false;
        return FINAL_FS_APPROVAL_CONCLUSIONS.includes(fs.conclusion as FSConclusion);
      });

      if (fsWithNewApprovalDecision.length > 0) {
        const period = await budgetService.getBudgetByPeriodName(periodName);
        if (period) {
          const projectIds = new Set(
            fsWithNewApprovalDecision.map((fs) => String(fs.projectId).trim()),
          );
          const assetIds: string[] = [];
          period.archetypes.forEach((arch) => {
            arch.units.forEach((unit) => {
              unit.projects.forEach((project) => {
                if (projectIds.has(String(project.id).trim())) {
                  project.assets.forEach((asset) => assetIds.push(asset.id));
                }
              });
            });
          });
          if (assetIds.length > 0) {
            await taskService.triggerSystemTaskBatch(assetIds, 'FS_APPROVAL', currentUser);
          }
        }
      }

      const hasApprovalDecision = changedFS.some((fs) =>
        FINAL_FS_APPROVAL_CONCLUSIONS.includes(fs.conclusion as FSConclusion),
      );
      const emailNote = hasApprovalDecision
        ? ' Email notifications are being sent to requestors in the background.'
        : '';
      const triggerNote =
        fsWithNewApprovalDecision.length > 0
          ? ` Workflow trigger "When FS Approval" applied for ${fsWithNewApprovalDecision.length} FS.`
          : '';
      showToast(
        `Successfully updated ${changedFS.length} FS Proposal(s).${emailNote}${triggerNote}`,
        'success',
      );
      setEditMap(new Map());
      await invalidateFsApprovalQueries();
    } catch (err) {
      console.error('Failed to save FS Approval updates:', err);
      showToast('Failed to save changes.', 'error');
    }
  }, [editMap, showToast, invalidateFsApprovalQueries, periodName, currentUser]);

  const handleCancel = useCallback(() => {
    setEditMap(new Map());
  }, []);

  const getChangeSummary = useCallback((): ChangeSummary | null => {
    if (!isDirty) return null;
    const changes: { item: string; before: string; after: string }[] = [];

    for (const { original, current } of editMap.values()) {
      if (original.conclusion !== current.conclusion) {
        changes.push({
          item: `${current.projectName} Conclusion`,
          before: String(original.conclusion),
          after: String(current.conclusion),
        });
      }
      if (original.followUpAction !== current.followUpAction) {
        changes.push({
          item: `${current.projectName} Follow Up`,
          before: original.followUpAction || 'None',
          after: current.followUpAction || 'None',
        });
      }
    }

    if (changes.length === 0) return null;
    return { title: 'FS Approval Updates', changes };
  }, [isDirty, editMap]);

  useEffect(() => {
    setPageActions({ onSave: handleSave, onCancel: handleCancel, getSummary: getChangeSummary });
  }, [handleSave, handleCancel, getChangeSummary, setPageActions]);

  const columns = useMemo(
    () =>
      buildFsApprovalColumns({
        canEdit,
        onEditStatus: setStatusModalFs,
      }),
    [canEdit],
  );

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? '';

  const hasActiveFilters =
    debouncedSearch.length > 0 ||
    selectedArchetypes.length > 0 ||
    selectedHUs.length > 0 ||
    selectedCategories.length > 0 ||
    paybackMinActive ||
    paybackMaxActive;

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>
    );
  }

  if (!periodName) {
    return (
      <div className="text-center p-8 text-siloam-text-secondary">
        Please select a Budget Period from the top menu to view data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-siloam-text-primary">FS Approval Board</h2>
          <p className="mt-1 text-sm text-siloam-text-secondary">
            Periode <span className="font-medium text-siloam-text-primary">{periodName}</span>
          </p>
          {emailLinkFocus === 'approve' || emailLinkFocus === 'reject' ? (
            <p className="text-xs text-siloam-blue mt-1">
              Opened from email link — review the FS below, update Conclusion, then Save Changes.
            </p>
          ) : null}
        </div>
        {isDirty && canEdit ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 text-sm"
            >
              Save Changes
            </button>
          </div>
        ) : null}
      </div>

      <TaskFilterPanel
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        searchPlaceholder="Search project, unit, archetype, category, payback…"
        huOptions={filterOptions.hus}
        selectedHUs={selectedHUs}
        setSelectedHUs={setSelectedHUs}
        archetypeOptions={filterOptions.archetypes}
        selectedArchetypes={selectedArchetypes}
        setSelectedArchetypes={setSelectedArchetypes}
        categoryOptions={filterOptions.categories}
        selectedCategories={selectedCategories}
        setSelectedCategories={setSelectedCategories}
        onResetFilters={resetLocalFilters}
        extraFilters={
          <FsApprovalPaybackFilter
            paybackMin={paybackMin}
            paybackMax={paybackMax}
            paybackMinActive={paybackMinActive}
            paybackMaxActive={paybackMaxActive}
            onPaybackMinChange={setPaybackMin}
            onPaybackMaxChange={setPaybackMax}
            onPaybackMinActiveChange={setPaybackMinActive}
            onPaybackMaxActiveChange={setPaybackMaxActive}
          />
        }
      >
        <div className="w-64">
          <Dropdown
            label="Sort by"
            options={SORT_OPTIONS.map((o) => o.label)}
            selectedValue={sortLabel}
            onSelect={(label) => {
              const selected = SORT_OPTIONS.find((o) => o.label === label)?.value;
              if (selected) setSortBy(selected);
            }}
          />
        </div>
      </TaskFilterPanel>

      <FSApprovalTableBlock
        columns={columns}
        data={paginatedData}
        isBlockingLoad={isBlockingLoad}
        showTableBusy={showTableBusy}
        isSearchStaging={isSearchStaging}
        isTableError={tableQuery.isError}
        hasActiveFilters={hasActiveFilters}
        debouncedSearch={debouncedSearch}
        totalCount={totalCount}
        footerTotalCount={footerTotalCount}
        showPagination={showPagination}
        currentPage={currentPage}
        totalPages={totalPages}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={setItemsPerPage}
      />

      {statusModalFs ? (
        <FSApprovalStatusModal
          projectName={statusModalFs.projectName}
          currentStatus={String(statusModalFs.conclusion)}
          currentFollowUp={statusModalFs.followUpAction || ''}
          onClose={() => setStatusModalFs(null)}
          onConfirm={handleStatusModalConfirm}
        />
      ) : null}
    </div>
  );
};

FSApprovalPage.displayName = 'FSApprovalPage';
