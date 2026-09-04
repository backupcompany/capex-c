/**
 * Run: node src/features/configuration/users-roles/utils/authzPackFingerprint.selfcheck.mjs
 */
import assert from 'node:assert/strict';

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

console.log('authzPackFingerprint.selfcheck: ok');
