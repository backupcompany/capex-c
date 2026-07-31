#!/usr/bin/env node
/**
 * Copy shared secrets from capexbe/.env into leaf service .env files.
 * Usage: make sync-leaf-env [--force]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BE_ENV = join(ROOT, 'capexbe/.env');
const force = process.argv.includes('--force');

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

const SHARED_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'JWT_ACCESS_SECRET',
  'REDIS_URL',
  'CORS_ORIGINS',
  'NODE_ENV',
  'LOG_LEVEL',
];

function parseEnv(text) {
  const lines = text.split('\n');
  const map = new Map();
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    map.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return { map, lines };
}

if (!existsSync(BE_ENV)) {
  console.error('Missing capexbe/.env — run: make env');
  process.exit(1);
}

const be = parseEnv(readFileSync(BE_ENV, 'utf8'));
let written = 0;
let skipped = 0;

for (const leaf of LEAVES) {
  const dir = join(ROOT, 'services', leaf);
  const example = join(dir, '.env.example');
  const out = join(dir, '.env');

  if (!existsSync(example)) {
    console.warn(`SKIP ${leaf} — no .env.example`);
    continue;
  }
  if (existsSync(out) && !force) {
    skipped++;
    continue;
  }

  const portMatch = readFileSync(example, 'utf8').match(/^PORT=(\d+)/m);
  const port = portMatch?.[1] ?? '3002';

  const lines = [
    `# Auto-generated from capexbe/.env — make sync-leaf-env`,
    `PORT=${port}`,
    '',
  ];

  for (const key of SHARED_KEYS) {
    const v = be.map.get(key);
    if (v != null && v !== '') lines.push(`${key}=${v}`);
  }

  if (!lines.some((l) => l.startsWith('CORS_ORIGINS='))) {
    lines.splice(3, 0, 'CORS_ORIGINS=http://localhost:3000');
  }
  if (!lines.some((l) => l.startsWith('REDIS_URL=')) && leaf === 'capex-auth') {
    lines.push('REDIS_URL=redis://127.0.0.1:6379');
  }

  writeFileSync(out, `${lines.join('\n')}\n`);
  written++;
  console.log(`OK  ${leaf}/.env`);
}

console.log(`\nDone — wrote ${written}, skipped ${skipped} (existing). Use --force to overwrite.`);
