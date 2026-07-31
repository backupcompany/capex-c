#!/usr/bin/env node
/**
 * Static microservices checks — no running services required (CI-safe).
 * Usage: make verify-microservices-static
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];

const LEAF_SERVICES = [
  { name: 'capex-notifications', port: 3002, env: 'CAPEX_SERVICE_NOTIFICATIONS_URL' },
  { name: 'capex-audit', port: 3003, env: 'CAPEX_SERVICE_AUDIT_URL' },
  { name: 'capex-backup', port: 3004, env: 'CAPEX_SERVICE_BACKUP_URL' },
  { name: 'capex-config', port: 3005, env: 'CAPEX_SERVICE_CONFIGURATION_URL' },
  { name: 'capex-mom-daily-summary', port: 3006, env: 'CAPEX_SERVICE_MOM_DAILY_SUMMARY_URL' },
  { name: 'capex-asset-timeline', port: 3007, env: 'CAPEX_SERVICE_ASSET_TIMELINE_URL' },
  { name: 'capex-duplicate-detection', port: 3008, env: 'CAPEX_SERVICE_DUPLICATE_DETECTION_URL' },
  { name: 'capex-user-admin', port: 3009, env: 'CAPEX_SERVICE_USER_ADMIN_URL' },
  { name: 'capex-procurement', port: 3010, env: 'CAPEX_SERVICE_PROCUREMENT_URL' },
  { name: 'capex-fs', port: 3011, env: 'CAPEX_SERVICE_FS_URL' },
  { name: 'capex-monitoring', port: 3012, env: 'CAPEX_SERVICE_MONITORING_URL' },
  { name: 'capex-reporting', port: 3013, env: 'CAPEX_SERVICE_REPORTING_URL' },
  { name: 'capex-executive-summary', port: 3014, env: 'CAPEX_SERVICE_EXECUTIVE_SUMMARY_URL' },
  { name: 'capex-tasks', port: 3015, env: 'CAPEX_SERVICE_TASKS_URL' },
  { name: 'capex-core', port: 3016, env: 'CAPEX_SERVICE_CORE_URL' },
  { name: 'capex-smart-migration', port: 3017, env: 'CAPEX_SERVICE_SMART_MIGRATION_URL' },
  { name: 'capex-auth', port: 3018, env: 'CAPEX_SERVICE_AUTH_URL' },
];

const REQUIRED_LEAF_FILES = [
  'package.json',
  '.env.example',
  'src/main.ts',
  'src/app.module.ts',
  'src/app.controller.ts',
  'src/leaf-route-allowlist.middleware.ts',
];

function parseEnvExample(text) {
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

console.log('=== CAPEX microservices static verify ===\n');

// 1. Leaf scaffolds
for (const svc of LEAF_SERVICES) {
  const dir = join(ROOT, 'services', svc.name);
  if (!existsSync(dir)) {
    failures.push(`missing service directory: services/${svc.name}`);
    continue;
  }
  for (const f of REQUIRED_LEAF_FILES) {
    if (!existsSync(join(dir, f))) failures.push(`services/${svc.name}/${f} missing`);
  }
  console.log(`OK  scaffold services/${svc.name} (:${svc.port})`);
}

// 2. Monolith auth cutover (Phase 10)
const appModule = readFileSync(join(ROOT, 'capexbe/src/app.module.ts'), 'utf8');
if (/AuthModule/.test(appModule)) {
  failures.push('capexbe/src/app.module.ts still imports AuthModule — Phase 10 cutover incomplete');
} else {
  console.log('OK  monolith auth cutover — no AuthModule in app.module.ts');
}

// 3. BFF auth leaf env
const authBff = readFileSync(join(ROOT, 'capex-apps/src/lib/auth/authBff.ts'), 'utf8');
if (!authBff.includes('CAPEX_SERVICE_AUTH_URL')) {
  failures.push('authBff.ts missing CAPEX_SERVICE_AUTH_URL override');
} else {
  console.log('OK  authBff.ts → CAPEX_SERVICE_AUTH_URL');
}

// 4. .env.example completeness
const envExample = readFileSync(join(ROOT, 'capex-apps/.env.example'), 'utf8');
for (const svc of LEAF_SERVICES) {
  if (!envExample.includes(svc.env)) {
    failures.push(`capex-apps/.env.example missing ${svc.env}`);
  }
}
if (!envExample.includes('NEXT_PUBLIC_CAPEXBE_URL')) {
  failures.push('capex-apps/.env.example missing NEXT_PUBLIC_CAPEXBE_URL');
} else {
  console.log('OK  capex-apps/.env.example — all 17 CAPEX_SERVICE_* vars');
}

// 5. Docker compose structure
const composeVerify = spawnSync('node', ['scripts/microservices/verify-compose-config.mjs'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (composeVerify.status !== 0) {
  failures.push('verify-compose-config failed');
  if (composeVerify.stderr) console.error(composeVerify.stderr);
} else {
  console.log('OK  docker-compose.microservices.yml structure');
}

// 6. run-all-leaf includes auth
const runAll = readFileSync(join(ROOT, 'scripts/microservices/run-all-leaf.mjs'), 'utf8');
if (!runAll.includes('capex-auth')) {
  failures.push('run-all-leaf.mjs missing capex-auth');
} else {
  console.log('OK  run-all-leaf.mjs — capex-auth registered');
}

if (!existsSync(join(ROOT, 'capex-apps/app/api/health/services/route.ts'))) {
  failures.push('capex-apps/app/api/health/services/route.ts missing');
} else {
  console.log('OK  BFF /api/health/services aggregation route');
}

// 7. BFF routing with .env.example values (no .env.local required)
const envMap = parseEnvExample(envExample);
process.env.NEXT_PUBLIC_CAPEXBE_URL =
  envMap.get('NEXT_PUBLIC_CAPEXBE_URL') || 'http://127.0.0.1:3001';
for (const svc of LEAF_SERVICES) {
  const v = envMap.get(svc.env);
  if (v) process.env[svc.env] = v;
}

const bff = spawnSync('node', ['scripts/microservices/verify-bff-routing.mjs'], {
  cwd: ROOT,
  env: process.env,
  encoding: 'utf8',
});
if (bff.status !== 0) {
  failures.push('verify-bff-routing failed (with .env.example values)');
  if (bff.stderr) console.error(bff.stderr);
  if (bff.stdout) console.error(bff.stdout);
} else {
  console.log('OK  BFF routing (synthetic env from .env.example)');
}

const mw = spawnSync('node', ['scripts/verify-middleware-security.mjs'], {
  cwd: join(ROOT, 'capex-apps'),
  encoding: 'utf8',
});
if (mw.status !== 0) {
  failures.push('verify-middleware-security failed');
  if (mw.stderr) console.error(mw.stderr);
  if (mw.stdout) console.error(mw.stdout);
} else {
  console.log('OK  middleware audit (includes /api/health/services)');
}

if (failures.length) {
  console.error('\nStatic microservices verify FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nStatic microservices verify PASSED (17 leaf + health gateway)');
