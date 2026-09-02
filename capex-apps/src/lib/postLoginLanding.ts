import { NAV_ITEMS, MAIN_NAV_LANDING_PAGE } from '../constants';
import type { Page, User, UserRole } from '../types';
import { buildConsolidatedPermissionMap, canAccessPageWithPermissionMap, isUserSuperAdmin } from './rolePermissionMatrix';
import { canNavigateToPage, type UserDataScopeShape } from './pagePermissions';

function scopesFromUser(user: User, allRoles: UserRole[]): UserDataScopeShape {
  if (isUserSuperAdmin(user, allRoles)) {
    return {
      all: true,
      archetypes: new Set(),
      hus: new Set(),
      archetypeIds: new Set(),
      huIds: new Set(),
    };
  }
  if (user.assignments?.some((a) => a.assignedScopes?.includes('All'))) {
    return {
      all: true,
      archetypes: new Set(),
      hus: new Set(),
      archetypeIds: new Set(),
      huIds: new Set(),
    };
  }
  const archetypes = new Set<string>();
  const hus = new Set<string>();
  const archetypeIds = new Set<string>();
  const huIds = new Set<string>();
  for (const a of user.assignments ?? []) {
    for (const scope of a.assignedScopes ?? []) {
      if (!scope || scope === 'All') continue;
      const key = String(scope);
      if (key.startsWith('ARCH-')) archetypeIds.add(key);
      else if (key.startsWith('HU-')) huIds.add(key);
      else archetypes.add(key);
    }
  }
  return { all: false, archetypes, hus, archetypeIds, huIds };
}

/**
 * Halaman setelah login / bila URL saat ini Hide: item pertama sidebar yang boleh dibuka.
 */
export function resolvePostLoginLandingPage(user: User, allRoles: UserRole[]): Page {
  const permMap = buildConsolidatedPermissionMap(user, allRoles);
  const scopes = scopesFromUser(user, allRoles);

  for (const item of NAV_ITEMS) {
    if (
      !canNavigateToPage(item.label, canAccessPageWithPermissionMap(permMap, item.label), scopes)
    ) {
      continue;
    }
    return item.label;
  }

  return MAIN_NAV_LANDING_PAGE;
}
