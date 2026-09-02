/**
 * Save role must POST full permissions and treat empty server echo as failure.
 * Run: node src/features/configuration/users-roles/utils/roleSavePersist.selfcheck.mjs
 */
import assert from 'node:assert/strict';

function acceptSavedPermissions(saved) {
  const perms = saved?.permissions;
  if (!Array.isArray(perms) || !perms.length) {
    throw new Error('Server tidak mengembalikan permissions — simpan mungkin gagal.');
  }
  return perms;
}

assert.deepEqual(
  acceptSavedPermissions({
    permissions: [{ hierarchy: 'Dashboard', permission: 'Hide' }],
  }),
  [{ hierarchy: 'Dashboard', permission: 'Hide' }],
);

assert.throws(() => acceptSavedPermissions({ permissions: [] }), /permissions/);
assert.throws(() => acceptSavedPermissions({}), /permissions/);
console.log('roleSavePersist.selfcheck: ok');
