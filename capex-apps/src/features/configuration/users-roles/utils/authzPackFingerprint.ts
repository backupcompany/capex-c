import type { User, UserRole } from '@/types';

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
