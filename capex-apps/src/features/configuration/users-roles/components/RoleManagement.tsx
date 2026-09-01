'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { UserRole, HIERARCHY_LEVELS, PermissionLevel, HierarchyLevel, Permission } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import { Dropdown } from '@/components/molecules/Dropdown/Dropdown';
import {
  deleteConfigViaBeOrFallback,
  saveConfigViaBeOrFallback,
} from '@/services/configurationCrudApi';
import { RolePermissionsEditor } from '@/features/configuration/users-roles/components/RolePermissionsEditor';
import { normalizeRolesWithAllLevels } from '@/features/configuration/users-roles/utils/roleNormalization';

export const RoleManagement: React.FC<{
    roles: UserRole[];
    onRolesListPatch?: (roles: UserRole[]) => void;
}> = ({ roles, onRolesListPatch }) => {
    const { showToast } = useToast();
    const [editedRoles, setEditedRoles] = useState<UserRole[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
    const [isAddingNewRole, setIsAddingNewRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');

    const persistedRoleIds = useMemo(() => new Set(roles.map((r) => r.id)), [roles]);

    useEffect(() => {
        if (isSaving) return;

        const rolesWithAllLevels = normalizeRolesWithAllLevels(
            JSON.parse(JSON.stringify(roles)) as UserRole[],
        );

        setEditedRoles(rolesWithAllLevels);

        if (selectedRoleId && !rolesWithAllLevels.some((r) => r.id === selectedRoleId)) {
            setSelectedRoleId(rolesWithAllLevels.length > 0 ? rolesWithAllLevels[0].id : null);
        } else if (!selectedRoleId && rolesWithAllLevels.length > 0) {
            setSelectedRoleId(rolesWithAllLevels[0].id);
        }
    }, [roles, selectedRoleId, isSaving]);

    const selectedRole = useMemo(
        () => editedRoles.find((r) => r.id === selectedRoleId),
        [editedRoles, selectedRoleId],
    );

    const updatePermission = async (level: HierarchyLevel, newPermission: PermissionLevel) => {
        if (!selectedRoleId || isSaving) return;
        const prevRoles = editedRoles;
        const nextRoles = editedRoles.map((role) => {
            if (role.id !== selectedRoleId) return role;
            const existingPermission = role.permissions.find((p) => p.hierarchy === level);
            const nextPermissions: Permission[] = existingPermission
                ? role.permissions.map((p) =>
                      p.hierarchy === level ? { ...p, permission: newPermission } : p,
                  )
                : [...role.permissions, { hierarchy: level, permission: newPermission }];
            return { ...role, permissions: nextPermissions };
        });
        const roleToSave = nextRoles.find((r) => r.id === selectedRoleId);
        if (!roleToSave) return;

        setEditedRoles(nextRoles);
        setIsSaving(true);
        try {
            const saved = await saveConfigViaBeOrFallback<UserRole>('role', roleToSave);
            if (!saved) throw new Error(`Gagal menyimpan izin '${roleToSave.roleName}'.`);
            onRolesListPatch?.(nextRoles);
        } catch (e) {
            setEditedRoles(prevRoles);
            showToast(e instanceof Error ? e.message : 'Gagal menyimpan izin role.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartAddNewRole = () => {
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
            };
            if (!Number.isFinite(persisted.id) || persisted.id <= 0) {
                throw new Error('Server tidak mengembalikan id role yang valid.');
            }
            const nextRoles = [...editedRoles, persisted];
            setEditedRoles(nextRoles);
            setSelectedRoleId(persisted.id);
            setIsAddingNewRole(false);
            setNewRoleName('');
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
            onRolesListPatch?.(nextRoles);
            showToast('Role berhasil dihapus.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Gagal menghapus role.', 'error');
        }
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
                            onSelect={(roleName) => {
                                const role = editedRoles.find((r) => r.roleName === roleName);
                                if (role) setSelectedRoleId(role.id);
                            }}
                        />
                    </div>
                    {selectedRole && (
                        <button
                            type="button"
                            onClick={() => void handleDeleteRole(selectedRoleId)}
                            disabled={isSaving}
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
                            disabled={isSaving}
                            className="bg-siloam-blue text-white px-4 py-2 rounded-xl text-sm hover:bg-siloam-blue/90 transition shadow-soft disabled:opacity-50"
                        >
                            + New Role
                        </button>
                    )}
                    {isSaving ? (
                        <span className="text-xs text-siloam-text-secondary">Menyimpan…</span>
                    ) : null}
                </div>
            </div>

            {selectedRole ? (
                <RolePermissionsEditor
                    selectedRole={selectedRole}
                    onUpdatePermission={(level, permission) => {
                        void updatePermission(level, permission);
                    }}
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
