'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  lazy,
  Suspense,
  memo,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { formatCurrency } from '../../lib/formatter';
import { SpreadsheetTable, SpreadsheetColumn } from '../../components/organisms/SpreadsheetTable/SpreadsheetTable';
import { TaskFilterPanel } from '../../components/organisms/TaskFilterPanel/TaskFilterPanel';
import { Dropdown } from '../../components/molecules/Dropdown/Dropdown';
import { MeetingFilterBar } from '../../components/organisms/MeetingFilterBar/MeetingFilterBar';
import { FsScreenRefreshChrome } from '../../components/molecules/FsScreenRefreshChrome/FsScreenRefreshChrome';
import type { FsEnrichedProject } from '../../hooks/queries/fetchFsUpdatePageData';
import { useFsUpdateMetaQuery, useFsUpdateTableQuery } from '../../hooks/useFsUpdateTableQuery';
import * as configService from '../../services/configService';
import {
  buildScopeFilterPayload,
  buildScopedArchetypeOptions,
  buildScopedHuOptions,
} from '../../lib/scopedFilterOptions';
import {
  type SortOption,
  type FsEditableProject,
  applyAutoFsApproval,
  buildFsChangeSummaryRows,
  diffChangedFsProjects,
  isFsUpdateSpecialProject,
  projectsWithNewFsApproval,
  resolveFsApproval,
  toFsProjectSavePatch,
} from './fsUpdateHelpers';
import { QuickFsUpdateModal } from './QuickFsUpdateModal';
import { FsSmartMigrationModal } from './FsSmartMigrationModal';

const STALE_MS = 120_000;
const SEARCH_DEBOUNCE_MS = 200;
const INITIAL_PAGE_SIZE = 20;

type FsProjectEditEntry = { original: FsEditableProject; current: FsEditableProject };

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

const FsUpdateExtraFilters = memo(function FsUpdateExtraFilters({
  showOnlyNotFSApproved,
  onShowOnlyNotFSApprovedChange,
  focusNeedingApproval,
  onFocusNeedingApprovalChange,
}: {
  showOnlyNotFSApproved: boolean;
  onShowOnlyNotFSApprovedChange: (checked: boolean) => void;
  focusNeedingApproval: boolean;
  onFocusNeedingApprovalChange: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center">
        <input
          id="show-only-not-fs-approved"
          type="checkbox"
          checked={showOnlyNotFSApproved}
          onChange={(e) => onShowOnlyNotFSApprovedChange(e.target.checked)}
          className="h-4 w-4 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
        />
        <label htmlFor="show-only-not-fs-approved" className="ml-2 text-sm font-medium text-siloam-text-primary">
          Show only projects not FS Approved (Default)
        </label>
      </div>
      <div className="flex items-center">
        <input
          id="focus-approval"
          type="checkbox"
          checked={focusNeedingApproval}
          onChange={(e) => onFocusNeedingApprovalChange(e.target.checked)}
          className="h-4 w-4 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
        />
        <label htmlFor="focus-approval" className="ml-2 text-sm font-medium text-siloam-text-primary">
          Focus on items needing Approval
        </label>
      </div>
    </div>
  );
});

export const FSUpdatePage: React.FC<FSUpdatePageProps> = ({
  periodName,
  currentUser,
  allRoles,
  setIsPageDirty,
  setPageActions,
  showToast,
  onDataChange,
}) => {
  const queryClient = useQueryClient();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.FSUpdate, 'view');
  const canEdit = permissions.canOperateOnPage(Page.FSUpdate, 'edit');
  const canCreateFS = permissions.isAllowed('FS Update', 'create');

  const [editMap, setEditMap] = useState<Map<string, FsProjectEditEntry>>(new Map());
  const isDirty = editMap.size > 0;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHUs, setSelectedHUs] = useState<string[]>([]);
  const [focusNeedingApproval, setFocusNeedingApproval] = useState(false);
  const [showOnlyNotFSApproved, setShowOnlyNotFSApproved] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('projectName_asc');
  const [meetingFilters, setMeetingFilters] = useState<{ archetype: string | null }>({ archetype: null });
  const [selectedProjectForFS, setSelectedProjectForFS] = useState<FsEnrichedProject | null>(null);
  const [viewFS, setViewFS] = useState<FeasibilityStudy | null>(null);
  const [isQuickFsModalOpen, setIsQuickFsModalOpen] = useState(false);
  const [isFsMigrationOpen, setIsFsMigrationOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(INITIAL_PAGE_SIZE);

  useEffect(() => {
    setIsPageDirty(isDirty);
  }, [isDirty, setIsPageDirty]);

  const [masterArchetypes, setMasterArchetypes] = useState<
    Awaited<ReturnType<typeof configService.getAllArchetypesConfig>>
  >([]);
  const [masterHus, setMasterHus] = useState<
    Awaited<ReturnType<typeof configService.getAllHospitalUnitsConfig>>
  >([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      configService.getAllArchetypesConfig(),
      configService.getAllHospitalUnitsConfig(),
    ]).then(([archetypes, hus]) => {
      if (!cancelled) {
        setMasterArchetypes(archetypes);
        setMasterHus(hus);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const scopeFilter = useMemo(
    () => buildScopeFilterPayload(permissions.userScopes, masterArchetypes, masterHus),
    [permissions.userScopes, masterArchetypes, masterHus],
  );

  const metaQuery = useFsUpdateMetaQuery(
    periodName,
    currentUser.id,
    canView,
    scopeFilter,
    STALE_MS,
  );

  const {
    tableQuery,
    rows: serverRows,
    totalCount,
    totalPages,
    isBlockingLoad,
    isBackgroundRefresh,
    isFilterRefreshing,
  } = useFsUpdateTableQuery({
    periodName,
    userId: currentUser.id,
    canView,
    page: currentPage,
    pageSize: itemsPerPage,
    search: searchTerm,
    searchDebounceMs: SEARCH_DEBOUNCE_MS,
    selectedHUs,
    sortBy,
    showOnlyNotFSApproved,
    focusNeedingApproval,
    meetingArchetype: meetingFilters.archetype,
    scopeFilter,
    staleTime: STALE_MS,
  });

  const fsSummary = metaQuery.data?.summary ?? {
    submittedQty: 0,
    submittedAmountIdr: 0,
    approvedQty: 0,
    approvedAmountIdr: 0,
    notApprovedQty: 0,
  };

  const filterArchetypes = masterArchetypes;
  const filterHus = masterHus;

  const filterOptions = useMemo(() => {
    const base = metaQuery.data?.filterOptions ?? tableQuery.data?.filterOptions ?? { archetypes: [], hus: [] };
    if (permissions.userScopes.all) return base;

    const scopedArch = buildScopedArchetypeOptions(filterArchetypes, permissions.userScopes, filterHus);
    const scopedHu = buildScopedHuOptions(filterHus, filterArchetypes, permissions.userScopes);
    const archSet = new Set(scopedArch);
    const huSet = new Set(scopedHu);

    return {
      archetypes:
        scopedArch.length > 0
          ? base.archetypes.filter((a) => archSet.has(a))
          : base.archetypes.filter((a) => permissions.userScopes.archetypes.has(a)),
      hus:
        scopedHu.length > 0
          ? base.hus.filter((h) => huSet.has(h))
          : base.hus.filter((h) => permissions.userScopes.hus.has(h)),
    };
  }, [metaQuery.data?.filterOptions, tableQuery.data?.filterOptions, permissions.userScopes, filterArchetypes, filterHus]);

  const paginatedData = useMemo(
    () => serverRows.map((row) => editMap.get(row.id)?.current ?? (row as FsEditableProject)),
    [serverRows, editMap],
  );

  const hasListData = totalCount > 0 || paginatedData.length > 0;

  useEffect(() => {
    if (tableQuery.isError) {
      console.error('Error loading FS Update data:', tableQuery.error);
      showToast('Failed to load project data.', 'error');
    }
  }, [tableQuery.isError, tableQuery.error, showToast]);

  useEffect(() => {
    if (metaQuery.isError) {
      console.error('Error loading FS Update meta:', metaQuery.error);
    }
  }, [metaQuery.isError, metaQuery.error]);

  useEffect(() => {
    setEditMap(new Map());
    setCurrentPage(1);
    setSearchTerm('');
    setSelectedHUs([]);
    setFocusNeedingApproval(false);
    setShowOnlyNotFSApproved(true);
    setSortBy('projectName_asc');
    setMeetingFilters({ archetype: null });
  }, [periodName]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedHUs,
    focusNeedingApproval,
    showOnlyNotFSApproved,
    sortBy,
    meetingFilters.archetype,
    itemsPerPage,
    periodName,
  ]);

  const handleMeetingFilterChange = useCallback(
    (filters: { archetype: string | null; assetTypeGroup: string | null }) => {
      setMeetingFilters({ archetype: filters.archetype });
    },
    [],
  );

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

  const invalidateFsUpdateQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['screen', 'fs-update', 'query', periodName, currentUser.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ['screen', 'fs-update', 'meta', periodName, currentUser.id],
      }),
    ]);
  }, [queryClient, periodName, currentUser.id]);

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

  const scopedArchetypeOptions = useMemo(
    () => buildScopedArchetypeOptions(filterArchetypes, permissions.userScopes, filterHus),
    [filterArchetypes, filterHus, permissions.userScopes],
  );

  const huOptions = useMemo(
    () => buildScopedHuOptions(filterHus, filterArchetypes, permissions.userScopes),
    [filterHus, filterArchetypes, permissions.userScopes],
  );

  useEffect(() => {
    if (
      meetingFilters.archetype &&
      scopedArchetypeOptions.length > 0 &&
      !scopedArchetypeOptions.includes(meetingFilters.archetype)
    ) {
      setMeetingFilters({ archetype: null });
    }
  }, [meetingFilters.archetype, scopedArchetypeOptions]);

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? '';

  const viewFsProject = useMemo(() => {
    if (!viewFS) return null;
    return paginatedData.find((p) => p.id === viewFS.projectId) ?? null;
  }, [viewFS, paginatedData]);

  const columns: SpreadsheetColumn<FsEditableProject>[] = useMemo(
    () => [
      { header: 'Project Code', accessor: 'projectCode' },
      { header: 'Project Name', accessor: 'projectName' },
      {
        header: 'AX Code',
        accessor: 'axCode',
        isEditable: (item) => canEdit && !isFsUpdateSpecialProject(item),
      },
      {
        header: 'Budget Plan',
        accessor: 'budgetPlan',
        isNumeric: true,
        formatCellDisplay: (value) => formatCurrency(Number(value) || 0),
      },
      {
        header: 'Approved Budget',
        accessor: 'approvedBudget',
        isNumeric: true,
        isEditable: (item) => canEdit && !isFsUpdateSpecialProject(item),
      },
      {
        header: 'Target Budget Start',
        accessor: 'targetBudgetStart',
        isEditable: canEdit,
        editorType: 'date',
      },
      {
        header: 'Budget Revenue Permonth',
        accessor: 'budgetRevenuePermonth',
        isNumeric: true,
        isEditable: canEdit,
      },
      {
        header: 'Assets Not FS Approved',
        accessor: (item) => item.assetsNotFSApprovedCount ?? 0,
        align: 'center',
        numericDisplay: 'plain',
      },
      {
        header: 'FS Status',
        accessor: (item) => item.fsStatus || 'Not Submitted',
        formatCellDisplay: (_, item) => {
          const status = item.fsStatus || 'Not Submitted';
          let statusColorClass = 'text-siloam-text-secondary';
          if (status === 'Approved' || status === 'Approved with Notes') {
            statusColorClass = 'text-siloam-green font-medium';
          } else if (status === 'Pending') {
            statusColorClass = 'text-warning font-medium';
          } else if (status === 'Rejected') {
            statusColorClass = 'text-danger font-medium';
          }
          return <span className={statusColorClass}>{status}</span>;
        },
      },
      {
        header: 'FS Action',
        accessor: (item) => item.id,
        align: 'center',
        formatCellDisplay: (_, project) => {
          const status = project.fsStatus || 'Not Submitted';
          if (isFsUpdateSpecialProject(project)) {
            return <span className="text-xs text-siloam-text-secondary">N/A</span>;
          }
          if (status === 'Not Submitted') {
            return canCreateFS ? (
              <button
                type="button"
                onClick={() => setSelectedProjectForFS(project)}
                className="px-3 py-1 bg-siloam-blue text-white text-xs rounded-lg hover:bg-siloam-blue/90"
              >
                Create FS
              </button>
            ) : (
              <span className="text-xs text-siloam-text-secondary">View only</span>
            );
          }
          return (
            <button
              type="button"
              onClick={() => void handleViewFS(project)}
              className="px-3 py-1 border border-siloam-border text-siloam-text-primary text-xs rounded-lg hover:bg-siloam-bg"
            >
              View FS
            </button>
          );
        },
      },
      {
        header: 'FS Approval',
        accessor: (item) => resolveFsApproval(item),
        align: 'center',
        formatCellDisplay: (_, project) => (
          <div className="flex justify-center items-center h-full px-4 py-3">
            <input
              type="checkbox"
              checked={resolveFsApproval(project)}
              onChange={(e) => handleFSApprovalChange(project.id, e.target.checked)}
              disabled={!canEdit || isFsUpdateSpecialProject(project)}
              className="h-5 w-5 text-siloam-blue rounded border-gray-300 focus:ring-siloam-blue disabled:opacity-50"
              title="FS Approval - Check when FS is approved"
            />
          </div>
        ),
      },
    ],
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
      <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Feasibility Study (FS) & Approved Budget Updates</h2>
          {isBlockingLoad ? (
            <p className="text-xs text-siloam-text-secondary mt-1 flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-siloam-blue border-t-transparent animate-spin" />
              Memuat data…
            </p>
          ) : isBackgroundRefresh ? (
            <p className="text-xs text-siloam-text-secondary mt-1">Memperbarui data di latar…</p>
          ) : null}
        </div>
        {isDirty && canEdit ? (
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90"
            >
              Save Changes
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
            Total FS yang Diajukan (Jumlah QTY)
          </p>
          <p className="mt-1 text-2xl font-bold text-siloam-text-primary">
            {fsSummary.submittedQty.toLocaleString('id-ID')}
          </p>
        </div>
        <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
            Total FS Amount (Diajukan)
          </p>
          <p className="mt-1 text-2xl font-bold text-siloam-blue">
            {formatCurrency(fsSummary.submittedAmountIdr)}
          </p>
        </div>
        <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
            Total FS Approved Qty
          </p>
          <p className="mt-1 text-2xl font-bold text-siloam-green">
            {fsSummary.approvedQty.toLocaleString('id-ID')}
          </p>
        </div>
        <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
            Total FS Amount (Approved)
          </p>
          <p className="mt-1 text-2xl font-bold text-siloam-green">
            {formatCurrency(fsSummary.approvedAmountIdr)}
          </p>
        </div>
        <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
            Total FS Belum Diapproved
          </p>
          <p className="mt-1 text-2xl font-bold text-warning">
            {fsSummary.notApprovedQty.toLocaleString('id-ID')}
          </p>
        </div>
      </div>

      <MeetingFilterBar
        onFilterChange={handleMeetingFilterChange}
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

      <div className="bg-siloam-surface rounded-xl shadow-soft p-6 relative min-h-[12rem]">
        <FsScreenRefreshChrome
          isBlockingLoad={isBlockingLoad}
          isBackgroundRefresh={isBackgroundRefresh}
          isFilterRefreshing={isFilterRefreshing}
          hasListData={hasListData}
          blockingMessage="Memuat data project…"
          filterMessage="Memfilter…"
        />
        <div className="bg-siloam-blue/10 p-3 rounded-lg text-sm text-siloam-blue mb-4">
          <strong>Note:</strong> Approved Budget for &apos;Network Pipeline&apos; and &apos;General & Routine
          Assets&apos; projects are automatically synced with their Budget Plan and cannot be edited here.
        </div>
        {isBlockingLoad ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-siloam-text-secondary gap-2">
            <span
              className="inline-block h-5 w-5 rounded-full border-2 border-siloam-border border-t-siloam-blue animate-spin"
              aria-hidden
            />
            <span>Memuat data project…</span>
          </div>
        ) : paginatedData.length > 0 ? (
          <SpreadsheetTable
            columns={columns}
            data={paginatedData}
            onDataChange={handleDataChange}
            rowHeaderAccessor="projectName"
          />
        ) : (
          <div className="py-12 text-center text-sm text-siloam-text-secondary">
            {tableQuery.isError ? (
              <span>Gagal memuat data. Periksa koneksi backend lalu refresh halaman.</span>
            ) : totalCount > 0 ? (
              <span>
                Tidak ada project yang cocok dengan filter saat ini. Coba matikan &quot;Show only
                projects not FS Approved&quot; atau reset filter.
              </span>
            ) : (
              <span>Tidak ada data project untuk periode {periodName}.</span>
            )}
          </div>
        )}
      </div>

      {totalCount > 0 ? (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-siloam-border">
          <div className="text-sm text-siloam-text-secondary">
            Showing {Math.min(totalCount, (currentPage - 1) * itemsPerPage + 1)} -{' '}
            {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} projects
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-siloam-text-secondary">Per page:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 border border-siloam-border rounded bg-siloam-bg text-sm focus:outline-none focus:ring-2 focus:ring-siloam-blue"
              >
                <option value={20}>20</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg hover:bg-siloam-surface disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <span className="text-sm text-siloam-text-secondary">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg hover:bg-siloam-surface disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {canEdit ? (
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
      ) : null}

      {canEdit ? (
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
