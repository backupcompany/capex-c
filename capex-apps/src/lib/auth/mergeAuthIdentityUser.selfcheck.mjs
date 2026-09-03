/**
 * ponytail: shell not ready when role matches but permissions still empty.
 * Run: node src/lib/auth/mergeAuthIdentityUser.selfcheck.mjs
 */
import assert from 'node:assert/strict';

function ready(assignments, roles, { dataInitialized = false, bootstrapFailed = false } = {}) {
  if (!assignments?.length) {
    return bootstrapFailed || dataInitialized;
  }
  if (!roles.length) {
    return bootstrapFailed || dataInitialized;
  }
  const matrixReady = assignments.some((a) => {
    const role = roles.find((r) => r.roleName === a.roleName);
    return role != null && (role.permissions?.length ?? 0) > 0;
  });
  if (matrixReady) return true;
  return bootstrapFailed || dataInitialized;
}

assert.equal(
  ready([{ roleName: 'FC Unit' }], [{ roleName: 'FC Unit', permissions: [] }]),
  false,
);
assert.equal(
  ready(
    [{ roleName: 'FC Unit' }],
    [{ roleName: 'FC Unit', permissions: [{ hierarchy: 'My Task', permission: 'View Only' }] }],
  ),
  true,
);
assert.equal(
  ready([{ roleName: 'FC Unit' }], [{ roleName: 'FC Unit', permissions: [] }], {
    dataInitialized: true,
  }),
  true,
);
console.log('mergeAuthIdentityUser.selfcheck: ok');
