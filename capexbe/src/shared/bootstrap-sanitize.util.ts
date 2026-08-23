function normRoleName(name: string): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Role permission matrix only for roles assigned to the viewer (prod data minimization). */
export function sanitizeRolesForViewer(
  roles: Array<{ id?: number; roleName?: string; permissions?: unknown[] }>,
  assignments: Array<{ roleName?: string; roleId?: number }> | undefined,
): typeof roles {
  const assignedIds = new Set(
    (assignments ?? [])
      .map((a) => Number(a.roleId))
      .filter((id) => Number.isFinite(id) && id > 0),
  );
  const assignedNames = new Set(
    (assignments ?? []).map((a) => normRoleName(String(a.roleName ?? ''))).filter(Boolean),
  );

  return roles.map((role) => {
    const id = Number(role.id);
    const name = normRoleName(String(role.roleName ?? ''));
    const keep =
      (Number.isFinite(id) && assignedIds.has(id)) || (name !== '' && assignedNames.has(name));
    if (keep) return role;
    return {
      id: role.id,
      roleName: role.roleName,
      permissions: [],
    };
  });
}
