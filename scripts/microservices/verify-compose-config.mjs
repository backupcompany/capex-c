#!/usr/bin/env node
/**
 * Validate deploy/docker-compose.microservices.yml — no running stack required.
 * Usage: make verify-compose-config
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const COMPOSE = join(ROOT, 'deploy/docker-compose.microservices.yml');
const DOCKERFILE = join(ROOT, 'services/Dockerfile.leaf');

const LEAVES = [
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

const failures = [];

if (!existsSync(COMPOSE)) {
  console.error('Missing', COMPOSE);
  process.exit(1);
}
if (!existsSync(DOCKERFILE)) {
  failures.push('services/Dockerfile.leaf missing');
}

const src = readFileSync(COMPOSE, 'utf8');

console.log('=== CAPEX compose config verify ===\n');

for (const req of ['redis:', 'capex-api:', 'capex-web:', 'services/Dockerfile.leaf']) {
  if (!src.includes(req)) failures.push(`compose missing reference: ${req}`);
}

for (const leaf of LEAVES) {
  if (!src.includes(`${leaf.name}:`)) {
    failures.push(`compose missing service: ${leaf.name}`);
    continue;
  }
  if (!src.includes(`SERVICE: ${leaf.name}`) && !src.includes(`SERVICE: ${leaf.name},`)) {
    failures.push(`${leaf.name}: missing Dockerfile.leaf SERVICE build-arg`);
  }
  if (!src.includes(`:${leaf.port}:${leaf.port}`) && !src.includes(`"127.0.0.1:${leaf.port}:${leaf.port}"`)) {
    failures.push(`${leaf.name}: port ${leaf.port} mapping not found`);
  }
  if (!src.includes(`127.0.0.1:${leaf.port}/health`) && !src.includes(`:${leaf.port}/health`)) {
    failures.push(`${leaf.name}: healthcheck should target :${leaf.port}/health`);
  }
  console.log(`OK  compose service ${leaf.name} :${leaf.port}`);
}

const webBlock = src.slice(src.indexOf('capex-web:'));
for (const leaf of LEAVES) {
  if (!webBlock.includes(leaf.env)) {
    failures.push(`capex-web missing env ${leaf.env}`);
  }
}
if (!webBlock.includes('NEXT_PUBLIC_CAPEXBE_URL')) {
  failures.push('capex-web missing NEXT_PUBLIC_CAPEXBE_URL');
} else {
  console.log('OK  capex-web — all 17 CAPEX_SERVICE_* env vars');
}

if (src.includes('capex-api:3001') || webBlock.includes('http://capex-api:3001')) {
  console.log('OK  capex-web → capex-api:3001 (health gateway)');
}

if (failures.length) {
  console.error('\nCompose config verify FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nCompose config verify PASSED');
