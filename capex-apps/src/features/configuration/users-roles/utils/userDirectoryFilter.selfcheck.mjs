/**
 * Self-check: Configuration user directory filter mirrors DB role_id semantics.
 * Run: node capex-apps/src/features/configuration/users-roles/utils/userDirectoryFilter.selfcheck.mjs
 */
import assert from 'node:assert/strict';

function userMatchesDirectoryFilter(user, opts) {
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

function filterUsersDirectory(users, opts) {
  const roleId =
    opts.roleId != null && Number.isFinite(opts.roleId) && opts.roleId > 0 ? opts.roleId : undefined;
  const q = (opts.q ?? '').trim();
  if (roleId == null && !q) return users;
  return users.filter((u) => userMatchesDirectoryFilter(u, { roleId, q }));
}

const users = [
  {
    id: 1,
    username: 'alice',
    email: 'alice@siloam.com',
    assignments: [{ roleId: 6, roleName: 'FC Unit', assignedScopes: ['All'] }],
  },
  {
    id: 2,
    username: 'bob',
    email: 'bob@siloam.com',
    assignments: [
      { roleId: 6, roleName: 'FC Unit', assignedScopes: ['HU-1'] },
      { roleId: 1, roleName: 'Super Admin', assignedScopes: ['All'] },
    ],
  },
  {
    id: 3,
    username: 'carol',
    email: 'carol@example.com',
    assignments: [{ roleId: 1, roleName: 'Super Admin', assignedScopes: ['All'] }],
  },
  {
    id: 4,
    username: 'dave',
    email: 'dave@siloam.com',
    assignments: [{ roleName: 'FC Unit', assignedScopes: ['All'] }], // missing roleId → no match by id
  },
];

const fc = filterUsersDirectory(users, { roleId: 6 });
assert.deepEqual(
  fc.map((u) => u.id),
  [1, 2],
  'roleId=6 must return only users with that assignment.roleId',
);

const emptyRole = filterUsersDirectory(users, { roleId: 999 });
assert.equal(emptyRole.length, 0, 'unknown roleId must return [] — never full list');

const bySearch = filterUsersDirectory(users, { q: 'alice' });
assert.deepEqual(bySearch.map((u) => u.id), [1]);

const roleAndSearch = filterUsersDirectory(users, { roleId: 6, q: 'bob' });
assert.deepEqual(roleAndSearch.map((u) => u.id), [2]);

const noFilter = filterUsersDirectory(users, {});
assert.equal(noFilter.length, 4, 'no filter returns all');

console.log('userDirectoryFilter.selfcheck: ok');
