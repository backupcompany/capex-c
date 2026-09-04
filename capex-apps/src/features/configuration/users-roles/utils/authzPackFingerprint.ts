import type { User, UserRole } from '@/types';

/** Count permission rows — bootstrap sanitize strips other roles to []. */
export function rolePermissionsWeight(roles: UserRole[] | undefined): number {
  return (roles ?? []).reduce((n, r) => n + (r.permissions?.length ?? 0), 0);
}

/**
 * Shell patch guard must not keep bootstrap-stripped roles over a full matrix from /configuration/pack.
 */
export function shouldKeepGuardedRoles(
  base: UserRole[] | undefined,
  incoming: UserRole[] | undefined,
): boolean {
  if (!Array.isArray(incoming)) return true;
  return rolePermissionsWeight(base) >= rolePermissionsWeight(incoming);
}

/** Compact fingerprint so SA Configuration poll can skip no-op pack writes. */
export function authzPackFingerprint(
  roles: UserRole[] | undefined,
  users: User[] | undefined,
): string {
  const rolePart = (roles ?? [])
    .map((r) => {
      const perms = (r.permissions ?? [])
        .map((p) => `${p.hierarchy}=${p.permission}`)
        .sort()
        .join(',');
      return `${r.id}:${r.roleName}:{${perms}}`;
    })
    .sort()
    .join('|');

  const userPart = (users ?? [])
    .map((u) => {
      const assigns = (u.assignments ?? [])
        .map((a) => {
          const scopes = [...(a.assignedScopes ?? [])].map(String).sort().join('+');
          return `${a.roleId ?? a.roleName}:${scopes}`;
        })
        .sort()
        .join(',');
      return `${u.id}:{${assigns}}`;
    })
    .sort()
    .join('|');

  return `${rolePart}#${userPart}`;
}
