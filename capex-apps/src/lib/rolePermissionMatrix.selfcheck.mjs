/**
 * Locks Capex Project List RBAC footgun: empty allRoles ⇒ Hide; page must use shell roles.
 * Run: node src/lib/rolePermissionMatrix.selfcheck.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, 'rolePermissionMatrix.ts'), 'utf8');
const page = readFileSync(join(dir, '../screens/CapexProjectListPage.tsx'), 'utf8');
const route = readFileSync(join(dir, '../components/app-shell/AppRouteRenderer.tsx'), 'utf8');

assert.match(src, /if\s*\(\s*!allRoles\.length\s*\)/, 'empty allRoles must Hide');
assert.match(
  page,
  /usePermissions\(\s*currentUser,\s*shellAllRoles\s*\)/,
  'Capex Project List must use shell allRoles for RBAC',
);
assert.doesNotMatch(
  page,
  /if\s*\(\s*!canView\s*\)\s*\{[\s\S]*tidak memiliki izin/,
  'must not re-deny view with a second role source',
);
assert.match(
  route,
  /Page\.CapexProjectList[\s\S]*allRoles=\{allRoles\}/,
  'AppRouteRenderer must pass shell allRoles into Capex Project List',
);

console.log('rolePermissionMatrix.selfcheck: ok');
