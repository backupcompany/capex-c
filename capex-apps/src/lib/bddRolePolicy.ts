import type { User } from '../types';

/**
 * Roles that may see/edit assets with empty/`unassigned` BDD priority.
 * Keep aligned with BE `assignmentRolesCanSeeUnassignedBdd` (project-list BDD path).
 * PMO matches workflow/priority bypass — BDD used to omit PMO and blanked the screen.
 */
export const BDD_UNASSIGNED_ACCESS_ROLE_NAMES = ['Super Admin', 'PMO', 'BDD'] as const;

const normRole = (name: string | null | undefined): string =>
  String(name ?? '')
    .trim()
    .toLowerCase();

export function userCanAccessUnassignedBdd(user: User | null | undefined): boolean {
  if (!user?.assignments?.length) return false;
  return user.assignments.some((a) =>
    BDD_UNASSIGNED_ACCESS_ROLE_NAMES.some((r) => normRole(a.roleName) === normRole(r)),
  );
}
