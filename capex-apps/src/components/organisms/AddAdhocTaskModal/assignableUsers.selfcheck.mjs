/**
 * Run: node src/components/organisms/AddAdhocTaskModal/assignableUsers.selfcheck.mjs
 */
import assert from 'node:assert/strict';

function assignableUsers(users) {
  return (users ?? []).filter((u) => Number.isFinite(Number(u.id)) && Number(u.id) > 0);
}

function userAssignmentRoleLabel(user) {
  const roles = (user.assignments ?? [])
    .map((a) => String(a.roleName ?? '').trim())
    .filter(Boolean);
  return [...new Set(roles)].join(', ');
}

function userMatchesHuScope(user, huHint) {
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

function filterAssignableUsers(users, opts) {
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

const users = [
  { id: undefined, username: 'no-id', assignments: [] },
  {
    id: 2,
    username: 'beta',
    email: 'b@x.com',
    assignments: [{ roleName: 'FC Unit', assignedScopes: ['HU-OTHER'] }],
  },
  {
    id: 1,
    username: 'alpha',
    email: 'a@x.com',
    assignments: [{ roleName: 'HOSDIR', assignedScopes: ['HU-AIDO'] }],
  },
];

assert.deepEqual(
  assignableUsers(users).map((u) => u.id),
  [2, 1],
);

const filtered = filterAssignableUsers(users, { query: 'hos', huHint: 'AIDO' });
assert.equal(filtered[0].username, 'alpha');
assert.equal(filtered.length, 1);

console.log('assignableUsers.selfcheck: ok');
