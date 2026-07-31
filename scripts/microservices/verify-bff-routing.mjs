#!/usr/bin/env node
/**
 * Verify BFF env + path resolution for extractable leaf services.
 * Usage: make verify-bff-routing (sources capex-apps/.env.local)
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ROUTES = join(ROOT, 'capex-apps/src/lib/auth/serviceRoutes.ts');

function normalizePath(path) {
  return path.replace(/^\/+/, '').replace(/\/+$/, '').trim();
}

function matchesPrefix(normalized, prefix) {
  const base = prefix.replace(/\/+$/, '');
  if (!base) return false;
  return normalized === base || normalized.startsWith(`${base}/`);
}

function defaultBackendBase() {
  return (process.env.NEXT_PUBLIC_CAPEXBE_URL || process.env.CAPEXBE_URL || '')
    .replace(/\/$/, '')
    .trim();
}

function parseServiceRoutes() {
  const src = readFileSync(ROUTES, 'utf8');
  return [...src.matchAll(/name: '([^']+)'[\s\S]*?prefixes: \[([\s\S]*?)\][\s\S]*?envVar: '(CAPEX_SERVICE_[^']+)'/g)].map(
    ([, name, prefixBlock, envVar]) => ({
      name,
      envVar,
      prefixes: [...prefixBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]),
    }),
  );
}

function resolveBackendBaseForPath(path, routes) {
  const normalized = normalizePath(path);
  for (const route of routes) {
    const hit = route.prefixes.some((p) => matchesPrefix(normalized, p));
    if (!hit) continue;
    const override = process.env[route.envVar]?.trim().replace(/\/$/, '');
    if (override) return override;
    break;
  }
  return defaultBackendBase();
}

function expectedBase(path, routes) {
  const normalized = normalizePath(path);
  for (const route of routes) {
    const hit = route.prefixes.some((p) => matchesPrefix(normalized, p));
    if (!hit) continue;
    const override = process.env[route.envVar]?.trim().replace(/\/$/, '');
    return override || defaultBackendBase();
  }
  return defaultBackendBase();
}

const routes = parseServiceRoutes();
const failures = [];
const core = defaultBackendBase();

if (!core) failures.push('NEXT_PUBLIC_CAPEXBE_URL not set in env');

const requiredServiceVars = [
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
  'CAPEX_SERVICE_AUTH_URL',
];
for (const envVar of requiredServiceVars) {
  if (!process.env[envVar]?.trim()) failures.push(`${envVar} not set`);
}

const samplePaths = [
  'notifications/list',
  'notifications/mark-read',
  'audit/list-for-entity',
  'backup/export-full',
  'configuration/pack',
  'mom-daily-summary/rows',
  'asset-timeline',
  'duplicate-detection/projects/search',
  'user-admin/bulk-delete',
  'po-update/page-bundle',
  'gr-update/page-bundle',
  'fs/feasibility-studies/list',
  'fs-update/page-bundle',
  'monitoring/page-bundle',
  'dashboard/snapshot',
  'budget-multi-year/page-bundle',
  'executive-summary/page-bundle',
  'my-tasks',
  'task-actions/complete-workflow',
  'bootstrap',
  'project-list/query',
  'budget-hu/page-bundle',
  'smart-migration/progress',
];

for (const p of samplePaths) {
  const base = resolveBackendBaseForPath(p, routes);
  const expect = expectedBase(p, routes);
  if (base !== expect) {
    failures.push(`${p} → ${base} (expected ${expect})`);
  } else {
    console.log(`OK  ${p} → ${base}`);
  }
}

if (failures.length) {
  console.error('\nBFF routing verification FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nBFF routing verification PASSED');
