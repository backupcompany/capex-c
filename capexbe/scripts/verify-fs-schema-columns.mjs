#!/usr/bin/env node
/**
 * Static check: FS write paths use canonical projects column names from fs-db.constants.
 * Run: node scripts/verify-fs-schema-columns.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONSTANTS_PATH = join(ROOT, 'src', 'fs', 'fs-db.constants.ts');
const constantsSrc = readFileSync(CONSTANTS_PATH, 'utf8');

const required = ['ax_code', 'approved_budget', 'target_budget_start', 'budget_revenue_permonth'];
const exported = required.filter((col) => constantsSrc.includes(`'${col}'`));

const failures = [];
if (exported.length !== required.length) {
  failures.push('fs-db.constants.ts missing expected projects column exports');
}

const patchTargets = [
  join(ROOT, 'src', 'fs-update', 'fs-update.service.ts'),
  join(ROOT, 'src', 'smart-migration', 'fs-updates-migration.loader.ts'),
];

const forbiddenTypos = [
  'approved_budgets',
  'ax_codes',
  'target_budget_starts',
  'budget_revenue_per_month',
  'budget_revenue_monthly',
];

for (const file of patchTargets) {
  const text = readFileSync(file, 'utf8');
  for (const typo of forbiddenTypos) {
    if (text.includes(typo)) failures.push(`${file}: suspicious column name "${typo}"`);
  }
}

const updateService = readFileSync(patchTargets[0], 'utf8');
if (!updateService.includes('buildFsProjectPatchUpdate')) {
  failures.push('fs-update.service.ts must use buildFsProjectPatchUpdate from fs-db.constants');
}

if (failures.length) {
  console.error('FS schema column verification FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('OK  FS schema columns — canonical patch map in fs-db.constants.ts');
