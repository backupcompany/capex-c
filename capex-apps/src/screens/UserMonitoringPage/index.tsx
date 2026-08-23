'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArchetypeConfig, HospitalUnitConfig, User, UserRole } from '@/types';
import { Page } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';
import { usePagedListScreen } from '@/hooks/usePagedListScreen';
import { useToast } from '@/contexts/ToastContext';
import type { UserMonitoringListFilters } from '@/services/userMonitoringApi';
import { fetchConfigurationSlicesFromBackend } from '@/services/configurationApi';
import { saveConfigurationEntityViaBackend } from '@/services/configurationCrudApi';
import { getCurrentAppUserIdFromSession } from '@/features/configuration/shared/configSession';
import { UserEditorModal } from '@/features/configuration/users-roles/components/UserEditorModal';
import { isPasswordLoginEnabled } from '@/lib/auth/authConstants';
import { USER_MONITORING_REFETCH_MS } from './hooks/useUserMonitoringPageData';
import { useUserMonitoringPageData } from './hooks/useUserMonitoringPageData';
import { UserMonitoringStatCards } from './UserMonitoringStatCards';
import { UserMonitoringScopeSummary } from './UserMonitoringScopeSummary';
import { UserMonitoringUsersTableBlock } from './UserMonitoringUsersTableBlock';
import { buildUserMonitoringColumns } from './buildUserMonitoringColumns';

const SEARCH_DEBOUNCE_MS = 150;
const MAX_APP_USER_ID = 2147483647;

function isSuperAdminUser(user: User): boolean {
  return (
    user.assignments?.some((a) => {
      const n = String(a.roleName ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
      return n === 'superadmin' || n === 'superadministrator';
    }) ?? false
  );
}

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

interface UserMonitoringPageProps {
  currentUser: User;
  allRoles?: UserRole[];
}

export const UserMonitoringPage: React.FC<UserMonitoringPageProps> = ({
  currentUser,
  allRoles = [],
}) => {
  const { showToast } = useToast();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.UserMonitoring, 'view');
  const canAddUser = isSuperAdminUser(currentUser);

  const [statusFilter, setStatusFilter] = useState<UserMonitoringListFilters['status']>('all');
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftUser, setDraftUser] = useState<Partial<User> | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [editorRoles, setEditorRoles] = useState<UserRole[]>(allRoles);
  const [archetypes, setArchetypes] = useState<ArchetypeConfig[]>([]);
  const [hospitalUnits, setHospitalUnits] = useState<HospitalUnitConfig[]>([]);
  const [knownUsers, setKnownUsers] = useState<User[]>([]);
  const passwordLoginEnabled = isPasswordLoginEnabled();
  const authProvisionMode = passwordLoginEnabled ? 'immediate' : 'sso';

  const {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    isSearchStaging,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
  } = usePagedListScreen({
    filterResetKey: `${statusFilter}\u0001${selectedUnit ?? ''}`,
    initialPageSize: 25,
    searchDebounceMs: SEARCH_DEBOUNCE_MS,
  });

  const pageData = useUserMonitoringPageData({
    userId: currentUser.id,
    canView,
    debouncedSearch,
    isSearchStaging,
    statusFilter,
    selectedUnit,
    currentPage,
    itemsPerPage,
  });

  const {
    tableQuery,
    tableRows,
    totalCount,
    totalPages,
    showPagination,
    isBlockingLoad,
    showTableBusy,
    isBundleLoading,
    summary,
    unitOptions,
    archetypeSummary,
    unitSummary,
    liveNowMs,
    refreshAll,
    hasActiveFilters,
    normalizedSearch,
  } = pageData;

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages, setCurrentPage]);

  const handleUnitPick = useCallback((unitName: string) => {
    setSelectedUnit((prev) => (prev === unitName ? null : unitName));
  }, []);

  const roleCatalogOrder = useMemo(
    () => allRoles.map((r) => r.roleName).filter(Boolean),
    [allRoles],
  );

  const columns = useMemo(
    () => buildUserMonitoringColumns(liveNowMs, roleCatalogOrder),
    [liveNowMs, roleCatalogOrder],
  );

  const loadEditorLookups = useCallback(async () => {
    const pack = await fetchConfigurationSlicesFromBackend(null, currentUser.id, [
      'users',
      'roles',
      'archetypes',
      'hospitalUnits',
    ]);
    if (!pack) throw new Error('Gagal memuat master user/role dari backend.');
    setKnownUsers(Array.isArray(pack.users) ? (pack.users as User[]) : []);
    setEditorRoles(
      Array.isArray(pack.roles) && pack.roles.length > 0
        ? (pack.roles as UserRole[])
        : allRoles,
    );
    setArchetypes(Array.isArray(pack.archetypes) ? (pack.archetypes as ArchetypeConfig[]) : []);
    setHospitalUnits(
      Array.isArray(pack.hospitalUnits) ? (pack.hospitalUnits as HospitalUnitConfig[]) : [],
    );
    return pack;
  }, [currentUser.id, allRoles]);

  const handleOpenNewUser = useCallback(async () => {
    if (!canAddUser || isSavingUser) return;
    try {
      await loadEditorLookups();
      setDraftUser({
        username: '',
        email: '',
        phoneNumber: '',
        assignments: [{ roleName: allRoles[0]?.roleName || 'User', assignedScopes: [] }],
      });
      setEditorOpen(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal membuka form user.', 'error');
    }
  }, [canAddUser, isSavingUser, loadEditorLookups, allRoles, showToast]);

  const handleSaveNewUser = useCallback(
    async (user: User) => {
      if (isSavingUser) return;
      setIsSavingUser(true);
      try {
        const pack = await loadEditorLookups();
        const users = Array.isArray(pack?.users) ? (pack!.users as User[]) : knownUsers;
        const roles =
          Array.isArray(pack?.roles) && pack!.roles.length > 0
            ? (pack!.roles as UserRole[])
            : editorRoles;
        const arch =
          Array.isArray(pack?.archetypes) ? (pack!.archetypes as ArchetypeConfig[]) : archetypes;
        const units = Array.isArray(pack?.hospitalUnits)
          ? (pack!.hospitalUnits as HospitalUnitConfig[])
          : hospitalUnits;

        const nextUserId = users.reduce((max, u) => (u.id > max ? u.id : max), 0) + 1;
        const rawId = user.id;
        const stableId =
          typeof rawId === 'number' && rawId > 0 && rawId <= MAX_APP_USER_ID ? rawId : nextUserId;

        const archetypeNameToId = new Map(arch.map((a) => [a.name, a.id]));
        const huNameToId = new Map(units.map((hu) => [hu.name, hu.id]));
        const roleNameToId = new Map(roles.map((r) => [r.roleName, r.id]));
        const normalizedAssignments = (user.assignments || []).map((a) => ({
          ...a,
          roleId: roleNameToId.get(a.roleName),
          assignedScopes: Array.from(
            new Set(
              (a.assignedScopes || [])
                .map((s) => {
                  if (!s) return s;
                  if (s === 'All') return 'All';
                  if (s.startsWith('ARCH-') || s.startsWith('HU-')) return s;
                  return archetypeNameToId.get(s) || huNameToId.get(s) || s;
                })
                .filter(Boolean),
            ),
          ),
        }));

        const actorId = getCurrentAppUserIdFromSession() ?? currentUser.id;
        const email = String(user.email ?? '')
          .trim()
          .toLowerCase();
        if (!email) throw new Error('Email wajib diisi.');
        const emailClash = users.find(
          (u) =>
            u.id !== stableId &&
            String(u.email ?? '')
              .trim()
              .toLowerCase() === email,
        );
        if (emailClash) {
          throw new Error(
            `Email ${email} sudah dipakai user "${emailClash.username}" (id=${emailClash.id}). Pakai email unik agar login tidak bentrok.`,
          );
        }

        const userToSave = {
          ...user,
          id: stableId,
          email,
          assignments: normalizedAssignments,
        };
        const savedFromBe = await saveConfigurationEntityViaBackend<User>(
          actorId,
          'user',
          userToSave as User,
          { strictBackend: true },
        );
        if (!savedFromBe) throw new Error('Gagal menyimpan user ke public.users.');

        const savedEmail = String((savedFromBe as User).email ?? email);

        // Password mode only: also create Supabase Auth. SSO mode: login links by email on Microsoft sign-in.
        if (passwordLoginEnabled) {
          const { postProvisionAuthForUser } = await import('@/services/userAdminApi');
          const savedId = Number((savedFromBe as User).id ?? stableId);
          const auth = await postProvisionAuthForUser(actorId, savedId);
          setEditorOpen(false);
          setDraftUser(null);
          void refreshAll();
          if (auth.temporaryPassword) {
            showToast(
              `User ${auth.email} + Auth. Password sementara: ${auth.temporaryPassword}`,
              'success',
            );
          } else {
            showToast(`User ${auth.email} disimpan (Auth ${auth.status}).`, 'success');
          }
          return;
        }

        setEditorOpen(false);
        setDraftUser(null);
        void refreshAll();
        showToast(
          `User ${savedEmail} terdaftar. Mereka masuk lewat Microsoft SSO dengan email ini (bukan password).`,
          'success',
        );
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Gagal menambah user.', 'error');
        throw e;
      } finally {
        setIsSavingUser(false);
      }
    },
    [
      isSavingUser,
      loadEditorLookups,
      knownUsers,
      editorRoles,
      archetypes,
      hospitalUnits,
      currentUser.id,
      refreshAll,
      showToast,
      passwordLoginEnabled,
    ],
  );

  const refetchSeconds = Math.round(USER_MONITORING_REFETCH_MS / 1000);

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">
        Anda tidak memiliki izin untuk melihat halaman ini.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-siloam-text-primary">User Monitoring</h1>
          <p className="text-sm text-siloam-text-secondary mt-1">
            Data diperbarui otomatis setiap {refetchSeconds} detik dari sesi login & aktivitas aplikasi.
            {canAddUser
              ? ' Super Admin dapat mendaftarkan user di sini; login hanya Microsoft SSO.'
              : null}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {canAddUser ? (
            <button
              type="button"
              onClick={() => void handleOpenNewUser()}
              disabled={isSavingUser}
              className="px-4 py-2 rounded-xl bg-siloam-blue text-white text-sm font-semibold hover:bg-siloam-blue/90 disabled:opacity-50 shadow-soft"
            >
              + Tambah User
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="p-2 bg-siloam-surface border border-siloam-border rounded-lg hover:bg-siloam-bg text-siloam-text-secondary transition"
            title="Refresh"
            aria-label="Refresh data"
          >
            <RefreshIcon />
          </button>
        </div>
      </div>

      <UserMonitoringStatCards summary={summary} isLoading={isBundleLoading} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <UserMonitoringScopeSummary
          title="Ringkasan per Network"
          rows={archetypeSummary}
          isLoading={isBundleLoading}
        />
        <UserMonitoringScopeSummary
          title="Ringkasan per Unit"
          rows={unitSummary}
          onSelect={handleUnitPick}
          selectedLabel={selectedUnit}
          isLoading={isBundleLoading}
        />
      </div>

      <UserMonitoringUsersTableBlock
        columns={columns}
        rows={tableRows}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        selectedUnit={selectedUnit}
        onSelectedUnitChange={setSelectedUnit}
        unitOptions={unitOptions}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        isBlockingLoad={isBlockingLoad}
        showTableBusy={showTableBusy}
        isSearchStaging={isSearchStaging}
        isTableError={tableQuery.isError}
        hasActiveFilters={hasActiveFilters}
        normalizedSearch={normalizedSearch}
        totalCount={totalCount}
        footerTotalCount={totalCount}
        showPagination={showPagination}
        currentPage={currentPage}
        totalPages={totalPages}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={setItemsPerPage}
      />

      {canAddUser && editorOpen && draftUser ? (
        <UserEditorModal
          isOpen={editorOpen}
          onClose={() => {
            if (isSavingUser) return;
            setEditorOpen(false);
            setDraftUser(null);
          }}
          onSave={handleSaveNewUser}
          isSaving={isSavingUser}
          user={draftUser}
          roles={editorRoles.length ? editorRoles : allRoles}
          archetypes={archetypes}
          hospitalUnits={hospitalUnits}
          authProvisionMode={authProvisionMode}
        />
      ) : null}
    </div>
  );
};

UserMonitoringPage.displayName = 'UserMonitoringPage';
