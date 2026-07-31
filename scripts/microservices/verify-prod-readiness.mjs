#!/usr/bin/env node
/**
 * Production go-live gate — security + required BFF routing env.
 * Usage:
 *   make verify-prod-readiness
 *   CHECK_ENV=capex-apps/.env.local node scripts/microservices/verify-prod-readiness.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Required after Phase 10 cutover — monolith is health-only. */
const REQUIRED_BFF_SERVICE_VARS = [
  'CAPEX_SERVICE_AUTH_URL',
  'CAPEX_SERVICE_NOTIFICATIONS_URL',
  'CAPEX_SERVICE_AUDIT_URL',
  'CAPEX_SERVICE_BACKUP_URL',
  'CAPEX_SERVICE_CONFIGURATION_URL',
  'CAPEX_SERVICE_MOM_DAILY_SUMMARY_URL',
  'CAPEX_SERVICE_ASSET_TIMELINE_URL',
  'CAPEX_SERVICE_DUPLICATE_DETECTION_URL',
  'CAPEX_SERVICE_USER_ADMIN_URL',
  'CAPEX_SERVICE_PROCUREMENT_URL',
  'CAPEX_SERVICE_FS_URL',
  'CAPEX_SERVICE_MONITORING_URL',
  'CAPEX_SERVICE_REPORTING_URL',
  'CAPEX_SERVICE_EXECUTIVE_SUMMARY_URL',
  'CAPEX_SERVICE_TASKS_URL',
  'CAPEX_SERVICE_CORE_URL',
  'CAPEX_SERVICE_SMART_MIGRATION_URL',
];

const REQUIRED_BFF_FLAGS = [
  'NEXT_PUBLIC_USE_BACKEND_SESSION',
  'NEXT_PUBLIC_ENABLE_AZURE_SSO',
];

const failures = [];
const warnings = [];

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    map.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return map;
}

function run(cwd, cmd, args, label) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status !== 0) {
    failures.push(`${label} failed${out ? `: ${out.split('\n').slice(-3).join(' ')}` : ''}`);
    return false;
  }
  console.log(`OK  ${label}`);
  return true;
}

console.log('=== CAPEX production readiness gate ===\n');

// 1. .env.example documents all service vars
const feExample = join(ROOT, 'capex-apps/.env.example');
if (!existsSync(feExample)) {
  failures.push('missing capex-apps/.env.example');
} else {
  const exampleText = readFileSync(feExample, 'utf8');
  for (const key of REQUIRED_BFF_SERVICE_VARS) {
    if (!exampleText.includes(`${key}=`)) {
      failures.push(`.env.example missing ${key}`);
    }
  }
  if (!failures.some((f) => f.includes('.env.example'))) {
    console.log(`OK  .env.example lists ${REQUIRED_BFF_SERVICE_VARS.length} CAPEX_SERVICE_* vars`);
  }
}

// 2. Optional: validate prod env file
const checkEnv = process.env.CHECK_ENV?.trim();
if (checkEnv) {
  const envPath = join(ROOT, checkEnv);
  if (!existsSync(envPath)) {
    failures.push(`CHECK_ENV not found: ${checkEnv}`);
  } else {
    const env = parseEnv(readFileSync(envPath, 'utf8'));
    for (const key of REQUIRED_BFF_SERVICE_VARS) {
      const v = env.get(key)?.trim();
      if (!v) failures.push(`${checkEnv}: missing ${key}`);
      else if (v.includes('127.0.0.1') || v.includes('localhost')) {
        warnings.push(`${checkEnv}: ${key} still points to localhost`);
      }
    }
    for (const key of REQUIRED_BFF_FLAGS) {
      const v = env.get(key)?.trim().toLowerCase();
      if (!v || v === 'false' || v === '0') {
        failures.push(`${checkEnv}: ${key} must be enabled for production`);
      }
    }
    if (!env.get('JWT_ACCESS_SECRET')?.trim()) {
      failures.push(`${checkEnv}: JWT_ACCESS_SECRET required`);
    }
    console.log(`OK  validated ${checkEnv} structure`);
  }
} else {
  warnings.push('Set CHECK_ENV=capex-apps/.env.production to validate prod env file');
}

// 3. No hardcoded localhost/secrets in prod-critical source
console.log('');
run(join(ROOT), 'node', ['scripts/microservices/verify-no-prod-hardcode.mjs'], 'no-prod-hardcode scan');

// 4. Security suite
console.log('');
run(join(ROOT, 'capexbe'), 'npm', ['run', 'verify:security'], 'capexbe verify:security');
run(join(ROOT, 'capex-apps'), 'node', ['scripts/verify-middleware-security.mjs'], 'FE middleware security');
run(join(ROOT), 'node', ['scripts/microservices/verify-cross-hu-scope.mjs'], 'cross-HU scope tests');

// 4. Static microservices + leaf build canary
console.log('');
run(join(ROOT), 'node', ['scripts/microservices/verify-static.mjs'], 'microservices static');
run(join(ROOT), 'make', ['verify-leaf-build'], 'leaf build canary');

if (warnings.length) {
  console.warn('\nWarnings:');
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (failures.length) {
  console.error('\nProduction readiness FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\nSee DEPLOY.md');
  process.exit(1);
}

console.log('\nProduction readiness gate PASSED');
console.log('Next: apply migrations → deploy stack → CHECK_ENV=... make verify-prod-readiness → smoke SSO');
