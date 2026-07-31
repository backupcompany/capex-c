#!/usr/bin/env node
/**
 * Ensure leaf services symlink @nestjs/core to capexbe (Reflector DI rule).
 * Usage: make verify-nest-symlinks
 */
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BE_CORE = join(ROOT, 'capexbe/node_modules/@nestjs/core');
const failures = [];

const LEAVES = [
  'capex-notifications',
  'capex-audit',
  'capex-backup',
  'capex-config',
  'capex-mom-daily-summary',
  'capex-asset-timeline',
  'capex-duplicate-detection',
  'capex-user-admin',
  'capex-procurement',
  'capex-fs',
  'capex-monitoring',
  'capex-reporting',
  'capex-executive-summary',
  'capex-tasks',
  'capex-core',
  'capex-smart-migration',
  'capex-auth',
];

if (!existsSync(BE_CORE)) {
  console.error('Missing capexbe/node_modules/@nestjs/core — run: cd capexbe && npm ci');
  process.exit(1);
}

for (const leaf of LEAVES) {
  const link = join(ROOT, 'services', leaf, 'node_modules/@nestjs/core');
  if (!existsSync(link)) {
    failures.push(`${leaf}: @nestjs/core missing — run: node services/${leaf}/scripts/link-nest-deps.mjs`);
    continue;
  }
  try {
    const st = lstatSync(link);
    if (!st.isSymbolicLink()) {
      failures.push(`${leaf}: @nestjs/core is not a symlink to capexbe`);
      continue;
    }
    const target = readlinkSync(link);
    if (!target.includes('capexbe')) {
      failures.push(`${leaf}: @nestjs/core symlink does not point to capexbe (${target})`);
    }
  } catch (e) {
    failures.push(`${leaf}: ${e instanceof Error ? e.message : e}`);
  }
}

if (failures.length) {
  console.error('Nest symlink verify FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`OK  @nestjs/core symlinked to capexbe for ${LEAVES.length} leaf services`);
