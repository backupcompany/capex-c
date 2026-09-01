/**
 * Self-check: shared role cache invalidation must match every userId key shape.
 * Run: node capexbe/src/configuration/role-cache-invalidate.selfcheck.mjs
 */
import assert from 'node:assert/strict';

function matchesRoleSlice(key, slice = 'roles') {
  return (
    key.startsWith('app:table:configuration:slice:') && key.endsWith(`:${slice}`)
  );
}

const keys = [
  'app:table:configuration:slice:179:roles',
  'app:table:configuration:slice:1:roles',
  'app:table:configuration:slice:179:users',
  'app:table:configuration:slice:179:archetypes',
];

const wiped = keys.filter((k) => matchesRoleSlice(k, 'roles'));
assert.deepEqual(wiped, [
  'app:table:configuration:slice:179:roles',
  'app:table:configuration:slice:1:roles',
]);
assert.equal(keys.filter((k) => matchesRoleSlice(k, 'users')).length, 1);

console.log('PASS role-cache-invalidate pattern');
