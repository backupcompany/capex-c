'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { UserRole, HIERARCHY_LEVELS, PermissionLevel, HierarchyLevel, Permission } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import { Dropdown } from '@/components/molecules/Dropdown/Dropdown';
import {
  deleteConfigViaBeOrFallback,
  saveConfigViaBeOrFallback,
} from '@/services/configurationCrudApi';
import { RolePermissionsEditor } from '@/features/configuration/users-roles/components/RolePermissionsEditor';
import { normalizeRolesWithAllLevels } from '@/features/configuration/users-roles/utils/roleNormalization';
import type { ConfigurationUnsavedHandle } from '@/features/configuration/shared/configurationUnsaved';

function rolePermissionsEqual(a: UserRole | undefined, b: UserRole | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.roleName !== b.roleName) return false;
  const am = new Map(a.permissions.map((p) => [p.hierarchy, p.permission]));
  const bm = new Map(b.permissions.map((p) => [p.hierarchy, p.permission]));
  if (am.size !== bm.size) return false;
  for (const [h, p] of am) {
    if (bm.get(h) !== p) return false;
  }
  return true;
}

export const RoleManagement: React.FC<{
  roles: UserRole[];
  onRolesListPatch?: (roles: UserRole[]) => void;
  onUnsavedReport?: (key: string, handle: ConfigurationUnsavedHandle | null) => void;
}> = ({ roles, onRolesListPatch, onUnsavedReport }) => {
  const { showToast } = useToast();
  const [editedRoles, setEditedRoles] = useState<UserRole[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [isAddingNewRole, setIsAddingNewRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  /** Keep local draft while dirty — don't clobber from parent refetch. */
  const [isDirty, setIsDirty] = useState(false);

  const persistedRoleIds = useMemo(() => new Set(roles.map((r) => r.id)), [roles]);

  const hydrateFromProps = useCallback(() => {
    const rolesWithAllLevels = normalizeRolesWithAllLevels(
      JSON.parse(JSON.stringify(roles)) as UserRole[],
    );
    setEditedRoles(rolesWithAllLevels);
    setIsDirty(false);
    setSelectedRoleId((prev) => {
      if (prev && rolesWithAllLevels.some((r) => r.id === prev)) return prev;
      return rolesWithAllLevels.length > 0 ? rolesWithAllLevels[0].id : null;
    });
  }, [roles]);

  useEffect(() => {
    if (isSaving || isDirty) return;
    hydrateFromProps();
  }, [roles, isSaving, isDirty, hydrateFromProps]);

  const selectedRole = useMemo(
    () => editedRoles.find((r) => r.id === selectedRoleId),
    [editedRoles, selectedRoleId],
  );

  const updatePermission = (level: HierarchyLevel, newPermission: PermissionLevel) => {
    if (!selectedRoleId || isSaving) return;
    setEditedRoles((prev) =>
      prev.map((role) => {
        if (role.id !== selectedRoleId) return role;
        const existingPermission = role.permissions.find((p) => p.hierarchy === level);
        const nextPermissions: Permission[] = existingPermission
          ? role.permissions.map((p) =>
              p.hierarchy === level ? { ...p, permission: newPermission } : p,
            )
          : [...role.permissions, { hierarchy: level, permission: newPermission }];
        return { ...role, permissions: nextPermissions };
      }),
    );
    setIsDirty(true);
  };

  const handleCancelChanges = useCallback(() => {
    if (isSaving) return;
    hydrateFromProps();
  }, [isSaving, hydrateFromProps]);

  const handleSaveChanges = useCallback(async () => {
    if (!selectedRoleId || isSaving || !isDirty) return;
    const roleToSave = editedRoles.find((r) => r.id === selectedRoleId);
    if (!roleToSave) return;
    const baseline = normalizeRolesWithAllLevels(
      JSON.parse(JSON.stringify(roles)) as UserRole[],
    ).find((r) => r.id === selectedRoleId);
    if (rolePermissionsEqual(roleToSave, baseline)) {
      setIsDirty(false);
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveConfigViaBeOrFallback<UserRole>('role', roleToSave);
      if (!saved) throw new Error(`Gagal menyimpan izin '${roleToSave.roleName}'.`);
      const savedPerms = (saved as UserRole).permissions;
      if (!Array.isArray(savedPerms) || !savedPerms.length) {
        throw new Error('Server tidak mengembalikan permissions — simpan mungkin gagal.');
      }
      const savedId = Number((saved as UserRole).id);
      const persisted: UserRole = {
        ...roleToSave,
        id: Number.isFinite(savedId) && savedId > 0 ? savedId : roleToSave.id,
        roleName: (saved as UserRole).roleName || roleToSave.roleName,
        permissions: savedPerms,
      };
      const nextRoles = editedRoles.map((r) => (r.id === selectedRoleId ? persisted : r));
      setEditedRoles(nextRoles);
      setSelectedRoleId(persisted.id);
      setIsDirty(false);
      onRolesListPatch?.(nextRoles);
      showToast(`Izin role '${persisted.roleName}' tersimpan.`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal menyimpan izin role.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [
    selectedRoleId,
    isSaving,
    isDirty,
    editedRoles,
    roles,
    onRolesListPatch,
    showToast,
  ]);

  useEffect(() => {
    if (!onUnsavedReport) return;
    if (!isDirty) {
      onUnsavedReport('role-permissions', null);
      return;
    }
    onUnsavedReport('role-permissions', {
      label: `Role permissions${selectedRole ? `: ${selectedRole.roleName}` : ''}`,
      save: handleSaveChanges,
      discard: handleCancelChanges,
    });
    return () => onUnsavedReport('role-permissions', null);
  }, [isDirty, onUnsavedReport, handleSaveChanges, handleCancelChanges, selectedRole]);

  const handleStartAddNewRole = () => {
    if (isDirty) {
      showToast('Simpan atau batalkan perubahan role dulu sebelum membuat role baru.', 'error');
      return;
    }
    setIsAddingNewRole(true);
    setNewRoleName('');
  };

  const handleConfirmAddNewRole = async () => {
    const trimmed = newRoleName.trim();
    if (!trimmed) {
      showToast('Nama role wajib diisi.', 'error');
      return;
    }
    if (editedRoles.some((r) => r.roleName.toLowerCase() === trimmed.toLowerCase())) {
      showToast('Nama role sudah ada.', 'error');
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const draft: UserRole = {
        id: 0,
        roleName: trimmed,
        permissions: HIERARCHY_LEVELS.map((level) => ({
          hierarchy: level,
          permission: 'Hide',
        })),
      };
      const saved = await saveConfigViaBeOrFallback<UserRole>('role', draft);
      if (!saved) throw new Error(`Gagal menyimpan role '${trimmed}'.`);
      const savedId = Number((saved as UserRole).id);
      const persisted: UserRole = {
        ...draft,
        id: Number.isFinite(savedId) && savedId > 0 ? savedId : draft.id,
        roleName: (saved as UserRole).roleName || trimmed,
        permissions:
          Array.isArray((saved as UserRole).permissions) && (saved as UserRole).permissions!.length
            ? (saved as UserRole).permissions!
            : draft.permissions,
      };
      if (!Number.isFinite(persisted.id) || persisted.id <= 0) {
        throw new Error('Server tidak mengembalikan id role yang valid.');
      }
      const nextRoles = [...editedRoles, persisted];
      setEditedRoles(nextRoles);
      setSelectedRoleId(persisted.id);
      setIsAddingNewRole(false);
      setNewRoleName('');
      setIsDirty(false);
      onRolesListPatch?.(nextRoles);
      showToast(`Role '${persisted.roleName}' tersimpan.`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal membuat role.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelAddNewRole = () => {
    setIsAddingNewRole(false);
    setNewRoleName('');
  };

  const handleDeleteRole = async (roleId: number | null) => {
    if (!roleId || isSaving) return;
    if (isDirty) {
      showToast('Simpan atau batalkan perubahan dulu sebelum menghapus role.', 'error');
      return;
    }
    const roleToDelete = editedRoles.find((r) => r.id === roleId);
    if (!roleToDelete) return;
    if (
      !window.confirm(
        `Hapus role '${roleToDelete.roleName}'? Tindakan ini tidak dapat dibatalkan.`,
      )
    ) {
      return;
    }
    try {
      if (persistedRoleIds.has(roleId) || roleId > 0) {
        await deleteConfigViaBeOrFallback('role', roleId);
      }
      const nextRoles = editedRoles.filter((r) => r.id !== roleId);
      setEditedRoles(nextRoles);
      setSelectedRoleId(nextRoles.length > 0 ? nextRoles[0].id : null);
      setIsDirty(false);
      onRolesListPatch?.(nextRoles);
      showToast('Role berhasil dihapus.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal menghapus role.', 'error');
    }
  };

  const selectRole = (roleName: string) => {
    if (isDirty) {
      showToast('Simpan atau batalkan perubahan dulu sebelum ganti role.', 'error');
      return;
    }
    const role = editedRoles.find((r) => r.roleName === roleName);
    if (role) setSelectedRoleId(role.id);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="w-64">
            <Dropdown
              label="Select Role to Configure"
              options={editedRoles.map((r) => r.roleName)}
              selectedValue={selectedRole?.roleName || ''}
              onSelect={selectRole}
            />
          </div>
          {selectedRole && (
            <button
              type="button"
              onClick={() => void handleDeleteRole(selectedRoleId)}
              disabled={isSaving || isDirty}
              className="text-sm self-end mb-2 text-danger hover:underline disabled:opacity-50"
            >
              Delete &apos;{selectedRole.roleName}&apos;
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2 self-end flex-wrap">
          {isAddingNewRole ? (
            <div className="flex items-center gap-2 bg-siloam-bg p-2 rounded-xl border border-siloam-border">
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleConfirmAddNewRole();
                }}
                placeholder="New role name"
                className="border border-siloam-border rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                autoFocus
                disabled={isSaving}
              />
              <button
                type="button"
                onClick={() => void handleConfirmAddNewRole()}
                disabled={isSaving}
                className="px-3 py-1.5 rounded-lg bg-siloam-blue text-white text-sm hover:bg-siloam-blue/90 disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Add'}
              </button>
              <button
                type="button"
                onClick={handleCancelAddNewRole}
                disabled={isSaving}
                className="px-3 py-1.5 rounded-lg border border-siloam-border text-sm hover:bg-siloam-surface disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartAddNewRole}
              disabled={isSaving || isDirty}
              className="bg-siloam-blue text-white px-4 py-2 rounded-xl text-sm hover:bg-siloam-blue/90 transition shadow-soft disabled:opacity-50"
            >
              + New Role
            </button>
          )}
          {isDirty ? (
            <>
              <button
                type="button"
                onClick={handleCancelChanges}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl border border-siloam-border text-sm hover:bg-siloam-bg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveChanges()}
                disabled={isSaving}
                className="bg-siloam-green text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-siloam-green/90 transition shadow-soft disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {selectedRole ? (
        <RolePermissionsEditor
          selectedRole={selectedRole}
          onUpdatePermission={updatePermission}
        />
      ) : (
        <div className="text-center p-12 bg-siloam-bg rounded-lg">
          <p className="text-siloam-text-secondary">
            Please select a role to begin configuration, or create a new one.
          </p>
        </div>
      )}
    </div>
  );
};
