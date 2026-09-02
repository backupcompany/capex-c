'use client';

import React from 'react';
import type { User, UserRole } from '@/types';
import type { ConfigurationDataPack } from '@/services/configurationApi';
import { UserManagement } from '@/features/configuration/users-roles/components/UserManagement';
import { RoleManagement } from '@/features/configuration/users-roles/components/RoleManagement';
import type { ConfigurationUnsavedHandle } from '@/features/configuration/shared/configurationUnsaved';

type UsersRolesTabProps = {
  pack: Partial<ConfigurationDataPack>;
  currentUser: User;
  patchUsersList: (users: User[]) => void;
  patchRolesList: (roles: UserRole[]) => void;
  onUnsavedReport?: (key: string, handle: ConfigurationUnsavedHandle | null) => void;
};

export function UsersRolesTab({
  pack,
  currentUser,
  patchUsersList,
  patchRolesList,
  onUnsavedReport,
}: UsersRolesTabProps) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-bold text-siloam-text-primary mb-3">User Management & Role Assignment</h2>
        <UserManagement
          users={pack.users ?? []}
          roles={pack.roles ?? []}
          archetypes={pack.archetypes ?? []}
          hospitalUnits={pack.hospitalUnits ?? []}
          currentUserId={currentUser.id}
          onUsersChange={() => undefined}
          patchUsersList={patchUsersList}
        />
      </section>
      <section>
        <h2 className="text-lg font-bold text-siloam-text-primary mb-3">Role Management</h2>
        <RoleManagement
          roles={pack.roles ?? []}
          onRolesListPatch={patchRolesList}
          onUnsavedReport={onUnsavedReport}
        />
      </section>
    </div>
  );
}
