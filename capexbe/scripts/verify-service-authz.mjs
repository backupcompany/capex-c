#!/usr/bin/env node
/**
 * High-risk modules must call AuthZ in service layer (Complete Mediation backup check).
 * Run: node scripts/verify-service-authz.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const REQUIRED = [
  { service: 'backup/backup.service.ts', pattern: 'assertHierarchyPermission' },
  { service: 'smart-migration/smart-migration.service.ts', pattern: 'assertHierarchyPermission' },
  { service: 'user-admin/user-admin.service.ts', pattern: 'authZ' },
  { service: 'fs-update/fs-update.service.ts', pattern: 'assertHierarchyPermission' },
  { service: 'configuration/configuration.service.ts', pattern: 'assertConfigurationAccess' },
];

const failures = [];
for (const { service, pattern } of REQUIRED) {
  const path = join(ROOT, service);
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    failures.push(`${service}: file not found`);
    continue;
  }
  if (!text.includes(pattern)) {
    failures.push(`${service}: missing ${pattern}`);
  }
}

if (failures.length) {
  console.error('Service AuthZ verification FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log(`OK  service AuthZ — ${REQUIRED.length} high-risk modules verified`);
