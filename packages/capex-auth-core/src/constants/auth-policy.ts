export const ACCESS_COOKIE = 'capex_access';
export const REFRESH_COOKIE = 'capex_refresh';
export const CSRF_COOKIE = 'capex_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

/** Super Admin is a global role and bypasses all authorization checks. */
export function isSuperAdminRole(roleNameOrSlug: string | null | undefined): boolean {
  const n = String(roleNameOrSlug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return n === 'superadmin' || n === 'superadministrator';
}
