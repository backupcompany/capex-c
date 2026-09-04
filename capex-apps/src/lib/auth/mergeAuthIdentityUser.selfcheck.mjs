/**
 * ponytail: shell waits for matrix only until bootstrap settles — never forever.
 * Run: node src/lib/auth/mergeAuthIdentityUser.selfcheck.mjs
 */
import assert from 'node:assert/strict';

function ready(assignments, roles, { dataInitialized = false, bootstrapFailed = false } = {}) {
  if (!assignments?.length) {
    return bootstrapFailed || dataInitialized;
  }
  const matrixReady = assignments.some((a) => {
    const role = roles.find((r) => r.roleName === a.roleName);
    return role != null && (role.permissions?.length ?? 0) > 0;
  });
  if (matrixReady) return true;
  if (!dataInitialized && !bootstrapFailed) return false;
  return true;
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
assert.equal(
  ready([{ roleName: 'FC Unit' }], [{ roleName: 'FC Unit', permissions: [] }], {
    bootstrapFailed: true,
  }),
  true,
);
console.log('mergeAuthIdentityUser.selfcheck: ok');
