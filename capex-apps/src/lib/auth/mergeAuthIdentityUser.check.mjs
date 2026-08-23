#!/usr/bin/env node
/** Assert session Super Admin wins over cached PMO with more scope entries. */
import assert from 'node:assert/strict';

function normalizeRoleNameKey(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function assignmentScopeCount(assignments) {
  return assignments.reduce((n, a) => n + (a.assignedScopes?.length ?? 0), 0);
}

function pickAssignments(fromSession, previousAssignments) {
  let assignments = fromSession;
  if (!fromSession.length && previousAssignments.length) {
    assignments = previousAssignments;
  } else if (fromSession.length && previousAssignments.length) {
    const sessionRoles = fromSession
      .map((a) => normalizeRoleNameKey(a.roleName))
      .sort()
      .join(',');
    const prevRoles = previousAssignments
      .map((a) => normalizeRoleNameKey(a.roleName))
      .sort()
      .join(',');
    if (
      sessionRoles === prevRoles &&
      assignmentScopeCount(previousAssignments) > assignmentScopeCount(fromSession)
    ) {
      assignments = previousAssignments;
    }
  }
  return assignments;
}

const sessionSa = [{ roleName: 'Super Admin', assignedScopes: ['All'] }];
const cachedPmo = [
  { roleName: 'PMO', assignedScopes: ['HU-A', 'HU-B', 'HU-C'] },
];

const picked = pickAssignments(sessionSa, cachedPmo);
assert.equal(picked[0].roleName, 'Super Admin');
assert.equal(picked[0].assignedScopes[0], 'All');

const sameRoleRicher = pickAssignments(
  [{ roleName: 'PMO', assignedScopes: [] }],
  cachedPmo,
);
assert.equal(sameRoleRicher[0].assignedScopes.length, 3);

console.log('ok mergeAuthIdentity prefers session role');
