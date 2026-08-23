#!/usr/bin/env node
/** Assert view-only roles egress drops permission matrix. */
import assert from 'node:assert/strict';

function sanitizeRolesForViewer(roles, includePermissionMatrix) {
  if (includePermissionMatrix) return roles;
  return roles.map((role) => {
    const { permissions: _drop, ...rest } = role;
    return { ...rest, permissions: [] };
  });
}

const roles = [
  { id: 1, name: 'Viewer', permissions: [{ hierarchy: 'Project', permission: 'View Only' }] },
  { id: 2, name: 'Admin', permissions: [{ hierarchy: 'Configuration', permission: 'View & Update' }] },
];

const stripped = sanitizeRolesForViewer(roles, false);
assert.equal(stripped[0].permissions.length, 0);
assert.equal(stripped[1].permissions.length, 0);
assert.equal(stripped[0].name, 'Viewer');

const full = sanitizeRolesForViewer(roles, true);
assert.equal(full[0].permissions.length, 1);

console.log('ok sanitizeRolesForViewer');
