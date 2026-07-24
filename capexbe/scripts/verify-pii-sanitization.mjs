#!/usr/bin/env node
/**
 * Static audit: PII masking wired into egress paths.
 * Run: node scripts/verify-pii-sanitization.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const CHECKS = [
  {
    file: 'configuration/configuration.service.ts',
    mustInclude: ['sanitizeUsersForDirectory', 'sanitizeVendorRecord', 'viewerCanSeeUserPii'],
    label: 'configuration pack masks users/vendors',
  },
  {
    file: 'bootstrap/bootstrap.service.ts',
    mustInclude: ['sanitizeUsersForDirectory', 'viewerCanSeeUserPii'],
    label: 'bootstrap masks user directory',
  },
  {
    file: 'project-list/project-list.service.ts',
    mustInclude: ['sanitizeUsersForDirectory'],
    label: 'project list masks users',
  },
  {
    file: 'monitoring/monitoring.service.ts',
    mustInclude: ['maskEmail', 'viewerCanSeeUserPii'],
    label: 'monitoring masks email',
  },
  {
    file: 'auth/auth-audit.service.ts',
    mustInclude: ['maskEmail'],
    label: 'login audit stores masked email',
  },
  {
    file: 'shared/response-sanitize.util.ts',
    mustInclude: ['stripInternalUserFields', 'USER_DIRECTORY_COLUMNS'],
    label: 'directory sanitizer strips auth fields',
  },
];

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function main() {
  const failures = [];
  for (const check of CHECKS) {
    const text = read(check.file);
    if (!check.mustInclude.every((s) => text.includes(s))) {
      failures.push(`Missing ${check.label} in ${check.file}`);
    }
  }

  const auditText = read('audit/audit.service.ts');
  if (auditText.includes("from('audit_logs').upsert")) {
    failures.push('audit.service still uses upsert on append-only audit_logs');
  }

  if (failures.length) {
    console.error('FAIL PII sanitization audit:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log('OK  PII sanitization — egress paths mask sensitive fields');
}

main();
