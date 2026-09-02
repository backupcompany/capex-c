import type { User } from '@/types';

/** Client mirror of BE/DB filter: user_assignments.role_id + username/email contains. */
export function userMatchesDirectoryFilter(
  user: User,
  opts: { roleId?: number; q?: string },
): boolean {
  const q = (opts.q ?? '').trim().toLowerCase();
  if (q) {
    const username = String(user.username ?? '').toLowerCase();
    const email = String(user.email ?? '').toLowerCase();
    if (!username.includes(q) && !email.includes(q)) return false;
  }
  const roleId = opts.roleId;
  if (roleId != null && Number.isFinite(roleId) && roleId > 0) {
    return (user.assignments || []).some((a) => Number(a.roleId) === roleId);
  }
  return true;
}

export function filterUsersDirectory(
  users: User[],
  opts: { roleId?: number; q?: string },
): User[] {
  const roleId =
    opts.roleId != null && Number.isFinite(opts.roleId) && opts.roleId > 0 ? opts.roleId : undefined;
  const q = (opts.q ?? '').trim();
  if (roleId == null && !q) return users;
  return users.filter((u) => userMatchesDirectoryFilter(u, { roleId, q }));
}
