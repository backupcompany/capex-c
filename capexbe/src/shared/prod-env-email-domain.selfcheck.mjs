/**
 * Domain lock: SSO + user create only allow ALLOWED_EMAIL_DOMAINS (default Siloam in SSO).
 * Run: node src/shared/prod-env-email-domain.selfcheck.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, 'prod-env.util.ts'), 'utf8');
const cfg = readFileSync(join(dir, '../configuration/configuration.service.ts'), 'utf8');
const fe = readFileSync(
  join(dir, '../../../capex-apps/src/features/configuration/users-roles/components/UserEditorModal.tsx'),
  'utf8',
);

assert.match(src, /assertEmailDomainAllowedForUser/, 'BE helper must exist');
assert.match(src, /siloamhospitals\.com/, 'SSO default domain must be Siloam');
assert.match(cfg, /assertEmailDomainAllowedForUser\(email\)/, 'saveUser must enforce domain');
assert.match(fe, /isAllowedCapexUserEmail/, 'FE create-user must validate domain');

console.log('prod-env-email-domain.selfcheck: ok');
