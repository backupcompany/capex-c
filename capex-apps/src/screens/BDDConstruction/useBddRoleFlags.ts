import { useMemo } from 'react';
import type { User } from '../../types';
import { userCanAccessUnassignedBdd } from '../../lib/bddRolePolicy';
import type { BddRoleFlags } from './listUtils';

export function useBddRoleFlags(currentUser: User): BddRoleFlags {
  const isSuperAdmin = useMemo(
    () => currentUser?.assignments.some((a) => norm(a.roleName) === 'super admin') || false,
    [currentUser],
  );
  /** Historical name: means may see/edit unassigned BDD rows (SA / PMO / BDD). */
  const hasBDDRole = useMemo(
    () => userCanAccessUnassignedBdd(currentUser),
    [currentUser],
  );
  return { isSuperAdmin, hasBDDRole };
}

function norm(name: string | null | undefined): string {
  return String(name ?? '')
    .trim()
    .toLowerCase();
}
