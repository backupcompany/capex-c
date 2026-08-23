'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from 'react';
import { Zap, FileSpreadsheet } from 'lucide-react';
import {
  User,
  UserRole,
  ChangeSummary,
  FeasibilityStudy,
  Page,
} from '../../types';
import * as taskService from '../../services/taskService';
import * as fsService from '../../services/fsService';
import { saveFsProjectsViaBackend } from '../../services/fsUpdateApi';
import { usePermissions } from '../../hooks/usePermissions';
import { TaskFilterPanel } from '../../components/organisms/TaskFilterPanel/TaskFilterPanel';
import { Dropdown } from '../../components/molecules/Dropdown/Dropdown';
import { MeetingFilterBar } from '../../components/organisms/MeetingFilterBar/MeetingFilterBar';
import type { FsEnrichedProject } from '../../hooks/queries/fetchFsUpdatePageData';
import {
  type SortOption,
  type FsEditableProject,
  applyAutoFsApproval,
  buildFsChangeSummaryRows,
  diffChangedFsProjects,
  projectsWithNewFsApproval,
  toFsProjectSavePatch,
} from './fsUpdateHelpers';
import { useFsUpdateFilterState } from './hooks/useFsUpdateFilterState';
import { useFsUpdatePageData } from './hooks/useFsUpdatePageData';
import { FSUpdateSummaryCards } from './FSUpdateSummaryCards';
import { FSUpdateTableBlock } from './FSUpdateTableBlock';
import { FsUpdateExtraFilters } from './FsUpdateExtraFilters';
import { buildFsUpdateColumns } from './buildFsUpdateColumns';

const QuickFsUpdateModal = lazy(() =>
  import('./QuickFsUpdateModal').then((m) => ({ default: m.QuickFsUpdateModal })),
);
const FsSmartMigrationModal = lazy(() =>
  import('./FsSmartMigrationModal').then((m) => ({ default: m.FsSmartMigrationModal })),
);
const FSProposalModal = lazy(() =>
  import('../../components/organisms/FSProposalModal/FSProposalModal').then((m) => ({
    default: m.FSProposalModal,
  })),
);

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Project Name (A-Z)', value: 'projectName_asc' },
  { label: 'HU Name (A-Z)', value: 'huName_asc' },
  { label: 'Budget Plan (Highest First)', value: 'budgetPlan_desc' },
];

type FsProjectEditEntry = { original: FsEditableProject; current: FsEditableProject };

interface FSUpdatePageProps {
  periodName: string;
  currentUser: User;
  allRoles: UserRole[];
  preloadedSnapshot?: unknown;
  setIsPageDirty: (isDirty: boolean) => void;
  setPageActions: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onDataChange: () => void;
}

export const FSUpdatePage: React.FC<FSUpdatePageProps> = ({
  periodName,
  currentUser,
  allRoles,
  setIsPageDirty,
  setPageActions,
  showToast,
  onDataChange,
}) => {
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.FSUpdate, 'view');
  const canEdit = permissions.canOperateOnPage(Page.FSUpdate, 'edit');
  const canCreateFS = permissions.isAllowed('FS Update', 'create');

  const [editMap, setEditMap] = useState<Map<string, FsProjectEditEntry>>(new Map());
  const isDirty = editMap.size > 0;

  const tableScrollHostRef = useRef<HTMLDivElement>(null);

  const filterState = useFsUpdateFilterState(periodName);
  const {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    isSearchStaging,
    selectedHUs,
    setSelectedHUs,
    focusNeedingApproval,
    setFocusNeedingApproval,
    showOnlyNotFSApproved,
    setShowOnlyNotFSApproved,
    sortBy,
    setSortBy,
    meetingFilters,
    setMeetingFilters,
    currentPage,
    setCurrentPage,
    pageSizeOverride,
    setPageSizeOverride,
  } = filterState;

  const pageData = useFsUpdatePageData({
    periodName,
    userId: currentUser.id,
    canView,
    userScopes: permissions.userScopes,
    tableScrollHostRef,
    debouncedSearch,
    isSearchStaging,
    selectedHUs,
    sortBy,
    showOnlyNotFSApproved,
    focusNeedingApproval,
    meetingArchetype: meetingFilters.archetype,
    currentPage,
    setCurrentPage,
    pageSizeOverride,
    showToast,
  });

  const {
    tableQuery,
    serverRows,
    fsSummary,
    filterOptions,
    scopedArchetypeOptions,
    huOptions,
    totalCount,
    totalPages,
    isBlockingLoad,
    showTableBusy,
    footerTotalCount,
    showPagination,
    tableMaxHeight,
    itemsPerPage,
    viewportPageSize,
    isMetaLoading,
    invalidateFsUpdateQueries,
  } = pageData;

  const [selectedProjectForFS, setSelectedProjectForFS] = useState<FsEnrichedProject | null>(null);
  const [viewFS, setViewFS] = useState<FeasibilityStudy | null>(null);
  const [isQuickFsModalOpen, setIsQuickFsModalOpen] = useState(false);
  const [isFsMigrationOpen, setIsFsMigrationOpen] = useState(false);

  useEffect(() => {
    setIsPageDirty(isDirty);
  }, [isDirty, setIsPageDirty]);

  useEffect(() => {
    setEditMap(new Map());
  }, [periodName]);

  const paginatedData = useMemo(
    () => serverRows.map((row) => editMap.get(row.id)?.current ?? (row as FsEditableProject)),
    [serverRows, editMap],
  );

  const handleMeetingFilterChange = useCallback(
    (filters: { archetype: string | null; assetTypeGroup: string | null }) => {
      setMeetingFilters({ archetype: filters.archetype });
    },
    [setMeetingFilters],
  );

  useEffect(() => {
    if (
      meetingFilters.archetype &&
      scopedArchetypeOptions.length > 0 &&
      !scopedArchetypeOptions.includes(meetingFilters.archetype)
    ) {
      setMeetingFilters({ archetype: null });
    }
  }, [meetingFilters.archetype, scopedArchetypeOptions, setMeetingFilters]);

  const mergeRowPatch = useCallback((original: FsEditableProject, patch: FsEditableProject) => {
    const merged = applyAutoFsApproval({ ...original, ...patch });
    if (patch.__fsApprovalChecked !== undefined) {
      merged.__fsApprovalChecked = patch.__fsApprovalChecked;
      merged.fsApproval = patch.__fsApprovalChecked;
    }
    return merged;
  }, []);

  const handleDataChange = useCallback(
    (newData: FsEditableProject[]) => {
      const changesMap = new Map(newData.map((item) => [item.id, item]));
      setEditMap((prev) => {
        const next = new Map(prev);
        for (const [id, patch] of changesMap) {
          const sourceRow = serverRows.find((r) => r.id === id) ?? patch;
          const original = prev.get(id)?.original ?? (sourceRow as FsEditableProject);
          next.set(id, { original, current: mergeRowPatch(original, patch) });
        }
        return next;
      });
    },
    [serverRows, mergeRowPatch],
  );

  const handleFSApprovalChange = useCallback(
    (projectId: string, isChecked: boolean) => {
      setEditMap((prev) => {
        const sourceRow = serverRows.find((r) => r.id === projectId);
        if (!sourceRow) return prev;
        const next = new Map(prev);
        const original = prev.get(projectId)?.original ?? (sourceRow as FsEditableProject);
        next.set(projectId, {
          original,
          current: { ...original, __fsApprovalChecked: isChecked, fsApproval: isChecked },
        });
        return next;
      });
    },
    [serverRows],
  );

  const handleSaveFSProposal = useCallback(
    async (fsData: Omit<FeasibilityStudy, 'createdAt' | 'updatedAt'>) => {
      if (!selectedProjectForFS) return;
      if (!canCreateFS) {
        showToast('Anda tidak memiliki izin untuk membuat atau menginput FS.', 'error');
        return;
      }
      try {
        await fsService.createFSProposal(fsData, { userId: currentUser.id });
        for (const asset of selectedProjectForFS.assets) {
          await taskService.triggerSystemTask(asset.id, 'FS_REQUEST', currentUser);
        }
        showToast('FS Proposal created successfully!', 'success');
        setSelectedProjectForFS(null);
        await invalidateFsUpdateQueries();
      } catch (err) {
        console.error('Failed to create FS proposal:', err);
        showToast('Failed to create FS Proposal.', 'error');
      }
    },
    [selectedProjectForFS, canCreateFS, currentUser, showToast, invalidateFsUpdateQueries],
  );

  const handleViewFS = useCallback(
    async (project: FsEnrichedProject) => {
      if (!project.fsId) return;
      try {
        const fs = await fsService.getFeasibilityStudyById(project.fsId, { userId: currentUser.id });
        if (fs) setViewFS(fs);
      } catch (err) {
        console.error('Failed to load FS:', err);
        showToast('Failed to load FS details.', 'error');
      }
    },
    [currentUser, showToast],
  );

  const handleSave = useCallback(async () => {
    const entries = [...editMap.values()];
    const originals = entries.map((e) => e.original);
    const currents = entries.map((e) => e.current);
    const changedProjects = diffChangedFsProjects(originals, currents);

    if (changedProjects.length === 0) {
      showToast('No changes to save.', 'success');
      setEditMap(new Map());
      return;
    }

    try {
      const saved = await saveFsProjectsViaBackend(
        currentUser.id,
        periodName,
        changedProjects.map(toFsProjectSavePatch),
      );
      if (!saved.ok) {
        showToast(saved.error || 'Failed to save changes — backend unavailable.', 'error');
        return;
      }

      const newlyApproved = projectsWithNewFsApproval(originals, currents);
      if (newlyApproved.length > 0) {
        const allAssetIds = newlyApproved.flatMap((project) => project.assets.map((asset) => asset.id));
        await taskService.triggerSystemTaskBatch(allAssetIds, 'BUDGET_APPROVED', currentUser);
      }

      showToast(
        `Successfully updated ${changedProjects.length} project(s).${
          newlyApproved.length > 0
            ? ` FS Approval triggered for ${newlyApproved.length} project(s).`
            : ''
        }`,
        'success',
      );
      onDataChange();
      setEditMap(new Map());
      await invalidateFsUpdateQueries();
    } catch (err) {
      console.error('Failed to save FS updates:', err);
      showToast('Failed to save changes.', 'error');
    }
  }, [editMap, currentUser, onDataChange, showToast, invalidateFsUpdateQueries, periodName]);

  const handleCancel = useCallback(() => {
    setEditMap(new Map());
  }, []);

  const getChangeSummary = useCallback((): ChangeSummary | null => {
    if (!isDirty) return null;
    const entries = [...editMap.values()];
    const rows = buildFsChangeSummaryRows(
      entries.map((e) => e.original),
      entries.map((e) => e.current),
    );
    if (rows.length === 0) return null;
    return { title: 'FS (Approved Budget) Updates', changes: rows };
  }, [isDirty, editMap]);

  useEffect(() => {
    setPageActions({ onSave: handleSave, onCancel: handleCancel, getSummary: getChangeSummary });
  }, [handleSave, handleCancel, getChangeSummary, setPageActions]);

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? '';

  const viewFsProject = useMemo(() => {
    if (!viewFS) return null;
    return paginatedData.find((p) => p.id === viewFS.projectId) ?? null;
  }, [viewFS, paginatedData]);

  const columns = useMemo(
    () =>
      buildFsUpdateColumns({
        canEdit,
        canCreateFS,
        onFsApprovalChange: handleFSApprovalChange,
        onViewFS: handleViewFS,
        onCreateFS: setSelectedProjectForFS,
      }),
    [canEdit, canCreateFS, handleFSApprovalChange, handleViewFS],
  );

  if (!periodName) {
    return (
      <div className="text-center p-8 text-siloam-text-secondary">
        Please select a Budget Period from the top menu to view data.
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">Anda tidak memiliki izin untuk melihat halaman ini.</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-siloam-text-primary">
            Feasibility Study (FS) & Approved Budget Updates
          </h2>
          <p className="mt-1 text-sm text-siloam-text-secondary">
            Periode <span className="font-medium text-siloam-text-primary">{periodName}</span>
          </p>
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

      <FSUpdateSummaryCards summary={fsSummary} isLoading={isMetaLoading} />

      <MeetingFilterBar
        onFilterChange={handleMeetingFilterChange}
        selectedArchetype={meetingFilters.archetype}
        archetypeOptions={scopedArchetypeOptions}
        showAssetGroupFilter={false}
      />

      <TaskFilterPanel
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        toolbarLeading={
          canEdit ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsQuickFsModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
                aria-label="Quick edit FS"
              >
                <Zap className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Quick FS</span>
              </button>
              <button
                type="button"
                onClick={() => setIsFsMigrationOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-100"
                aria-label="Smart migration FS from Excel"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Smart Migration</span>
              </button>
            </div>
          ) : null
        }
        huOptions={huOptions.length > 0 ? huOptions : filterOptions.hus}
        selectedHUs={selectedHUs}
        setSelectedHUs={setSelectedHUs}
        extraFilters={
          <FsUpdateExtraFilters
            showOnlyNotFSApproved={showOnlyNotFSApproved}
            onShowOnlyNotFSApprovedChange={setShowOnlyNotFSApproved}
            focusNeedingApproval={focusNeedingApproval}
            onFocusNeedingApprovalChange={setFocusNeedingApproval}
          />
        }
      >
        <div className="w-64">
          <Dropdown
            label="Sort by"
            options={SORT_OPTIONS.map((o) => o.label)}
            selectedValue={sortLabel}
            onSelect={(label) => {
              const selectedValue = SORT_OPTIONS.find((o) => o.label === label)?.value;
              if (selectedValue) setSortBy(selectedValue);
            }}
          />
        </div>
      </TaskFilterPanel>

      <FSUpdateTableBlock
        tableScrollHostRef={tableScrollHostRef}
        columns={columns}
        data={paginatedData}
        onDataChange={handleDataChange}
        periodName={periodName}
        tableMaxHeight={tableMaxHeight}
        isBlockingLoad={isBlockingLoad}
        showTableBusy={showTableBusy}
        isSearchStaging={isSearchStaging}
        isTableError={tableQuery.isError}
        totalCount={totalCount}
        footerTotalCount={footerTotalCount}
        showPagination={showPagination}
        currentPage={currentPage}
        totalPages={totalPages}
        itemsPerPage={itemsPerPage}
        viewportPageSize={viewportPageSize}
        pageSizeOverride={pageSizeOverride}
        onPageChange={setCurrentPage}
        onPageSizeOverrideChange={setPageSizeOverride}
      />

      {canEdit ? (
        <Suspense fallback={null}>
          <QuickFsUpdateModal
            isOpen={isQuickFsModalOpen}
            onClose={() => setIsQuickFsModalOpen(false)}
            onSuccess={() => {
              showToast('Data FS berhasil diperbarui.', 'success');
              onDataChange();
              void invalidateFsUpdateQueries();
            }}
            currentUser={currentUser}
            periodName={periodName}
          />
        </Suspense>
      ) : null}

      {canEdit ? (
        <Suspense fallback={null}>
          <FsSmartMigrationModal
            isOpen={isFsMigrationOpen}
            onClose={() => setIsFsMigrationOpen(false)}
            onSuccess={() => {
              onDataChange();
              void invalidateFsUpdateQueries();
            }}
            currentUser={currentUser}
            periodName={periodName}
            showToast={showToast}
          />
        </Suspense>
      ) : null}

      {selectedProjectForFS && canCreateFS ? (
        <Suspense fallback={null}>
          <FSProposalModal
            project={selectedProjectForFS}
            onClose={() => setSelectedProjectForFS(null)}
            onSave={handleSaveFSProposal}
          />
        </Suspense>
      ) : null}

      {viewFS && viewFsProject ? (
        <Suspense fallback={null}>
          <FSProposalModal
            project={viewFsProject}
            existingFS={viewFS}
            onClose={() => setViewFS(null)}
            onSave={async () => {}}
            readOnly
          />
        </Suspense>
      ) : null}
    </div>
  );
};

FSUpdatePage.displayName = 'FSUpdatePage';
