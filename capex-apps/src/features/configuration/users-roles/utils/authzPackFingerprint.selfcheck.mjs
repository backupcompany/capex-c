/**
 * Run: node src/features/configuration/users-roles/utils/authzPackFingerprint.selfcheck.mjs
 */
import assert from 'node:assert/strict';

function rolePermissionsWeight(roles) {
  return (roles ?? []).reduce((n, r) => n + (r.permissions?.length ?? 0), 0);
}

function shouldKeepGuardedRoles(base, incoming) {
  if (!Array.isArray(incoming)) return true;
  return rolePermissionsWeight(base) >= rolePermissionsWeight(incoming);
}

function authzPackFingerprint(roles, users) {
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

const roles = [
  {
    id: 2,
    roleName: 'FC Unit',
    permissions: [
      { hierarchy: 'Dashboard', permission: 'Hide' },
      { hierarchy: 'Budget HU', permission: 'View, Update, Create & Delete' },
    ],
  },
  {
    id: 1,
    roleName: 'Viewer',
    permissions: [{ hierarchy: 'Dashboard', permission: 'View Only' }],
  },
];

const a = authzPackFingerprint(roles, [{ id: 10, assignments: [{ roleId: 2, assignedScopes: ['HU-SHMD'] }] }]);
const b = authzPackFingerprint(
  [...roles].reverse(),
  [{ id: 10, assignments: [{ roleId: 2, assignedScopes: ['HU-SHMD'] }] }],
);
assert.equal(a, b);

const c = authzPackFingerprint(
  [
    {
      ...roles[0],
      permissions: [
        { hierarchy: 'Dashboard', permission: 'View Only' },
        { hierarchy: 'Budget HU', permission: 'View, Update, Create & Delete' },
      ],
    },
    roles[1],
  ],
  [{ id: 10, assignments: [{ roleId: 2, assignedScopes: ['HU-SHMD'] }] }],
);
assert.notEqual(a, c);

const stripped = [
  { id: 11, roleName: 'HOSDIR', permissions: [] },
  { id: 1, roleName: 'Super Admin', permissions: [{ hierarchy: 'Dashboard', permission: 'Hide' }] },
];
const full = [
  {
    id: 11,
    roleName: 'HOSDIR',
    permissions: [
      { hierarchy: 'Budget', permission: 'View Only' },
      { hierarchy: 'Project', permission: 'View & Update' },
    ],
  },
  { id: 1, roleName: 'Super Admin', permissions: [{ hierarchy: 'Dashboard', permission: 'Hide' }] },
];
assert.equal(shouldKeepGuardedRoles(stripped, full), false);
assert.equal(shouldKeepGuardedRoles(full, stripped), true);
assert.equal(shouldKeepGuardedRoles(full, undefined), true);

console.log('authzPackFingerprint.selfcheck: ok');
