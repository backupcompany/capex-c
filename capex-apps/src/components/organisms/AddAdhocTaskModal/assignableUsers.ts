import type { User } from '@/types';

/** Users selectable for ad-hoc assign — need a real numeric id from the API. */
export function assignableUsers(users: User[] | undefined): User[] {
  return (users ?? []).filter((u) => Number.isFinite(Number(u.id)) && Number(u.id) > 0);
}

export function userAssignmentRoleLabel(user: User): string {
  const roles = (user.assignments ?? [])
    .map((a) => String(a.roleName ?? '').trim())
    .filter(Boolean);
  return [...new Set(roles)].join(', ');
}

export function userMatchesHuScope(user: User, huHint: string | undefined): boolean {
  const hint = String(huHint ?? '').trim().toLowerCase();
  if (!hint) return true;
  const scopes = (user.assignments ?? []).flatMap((a) => a.assignedScopes ?? []);
  if (!scopes.length) return true;
  if (scopes.some((s) => String(s) === 'All')) return true;
  return scopes.some((s) => {
    const v = String(s).toLowerCase();
    return v === hint || v.includes(hint) || hint.includes(v.replace(/^hu-/, ''));
  });
}

export function filterAssignableUsers(
  users: User[] | undefined,
  opts: { query?: string; huHint?: string },
): User[] {
  const q = String(opts.query ?? '').trim().toLowerCase();
  let list = assignableUsers(users);
  if (q) {
    list = list.filter((u) => {
      const role = userAssignmentRoleLabel(u).toLowerCase();
      return (
        u.username.toLowerCase().includes(q) ||
        String(u.email ?? '')
          .toLowerCase()
          .includes(q) ||
        role.includes(q)
      );
    });
  }
  const hu = opts.huHint;
  return [...list].sort((a, b) => {
    const am = userMatchesHuScope(a, hu) ? 0 : 1;
    const bm = userMatchesHuScope(b, hu) ? 0 : 1;
    if (am !== bm) return am - bm;
    return a.username.localeCompare(b.username);
  });
}
