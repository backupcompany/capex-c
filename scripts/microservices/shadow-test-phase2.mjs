#!/usr/bin/env node
/**
 * Phase 2 shadow test — audit + backup leaf services.
 * Usage: make shadow-phase2
 * Requires: capexbe :3001 + capex-audit :3003 + capex-backup :3004
 */
const CORE = process.env.NEXT_PUBLIC_CAPEXBE_URL || 'http://127.0.0.1:3001';
const LEAVES = [
  {
    name: 'capex-audit',
    base: process.env.CAPEX_SERVICE_AUDIT_URL || 'http://127.0.0.1:3003',
    path: '/audit/list-for-entity',
    envVar: 'CAPEX_SERVICE_AUDIT_URL',
  },
  {
    name: 'capex-backup',
    base: process.env.CAPEX_SERVICE_BACKUP_URL || 'http://127.0.0.1:3004',
    path: '/backup/export-full',
    envVar: 'CAPEX_SERVICE_BACKUP_URL',
  },
];

const failures = [];

async function getJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* raw */
  }
  return { status: res.status, text, json };
}

async function checkHealth(name, base) {
  try {
    const { status, json } = await getJson(`${base.replace(/\/$/, '')}/health`);
    if (status !== 200) {
      failures.push(`${name} health → HTTP ${status}`);
      return false;
    }
    console.log(`OK  ${name} health → ${JSON.stringify(json)}`);
    return true;
  } catch (e) {
    failures.push(`${name} health unreachable (${base}): ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

async function checkAuthGate(name, base, path) {
  try {
    const { status } = await getJson(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (status !== 401) {
      failures.push(`${name} ${path} without auth → expected 401, got ${status}`);
      return false;
    }
    console.log(`OK  ${name} ${path} without auth → 401`);
    return true;
  } catch (e) {
    failures.push(`${name} ${path} failed: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

async function checkCoreCutover(path) {
  try {
    const { status } = await getJson(`${CORE.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (status !== 404) {
      failures.push(`capexbe ${path} after cutover → expected 404, got ${status}`);
      return false;
    }
    console.log(`OK  capexbe ${path} → 404 (cutover — route removed from monolith)`);
    return true;
  } catch (e) {
    failures.push(`capexbe cutover check ${path}: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

console.log('=== CAPEX Phase 2 shadow test: audit + backup ===\n');
console.log(`Core API: ${CORE}\n`);

const coreOk = await checkHealth('capexbe (core)', CORE);

for (const leaf of LEAVES) {
  const url = process.env[leaf.envVar]?.trim();
  if (!url) {
    failures.push(`${leaf.envVar} not set (add to capex-apps/.env.local)`);
    continue;
  }
  console.log(`OK  BFF env ${leaf.envVar}=${url}`);
}

for (const leaf of LEAVES) {
  const ok = await checkHealth(leaf.name, leaf.base);
  if (ok) await checkAuthGate(leaf.name, leaf.base, leaf.path);
  if (coreOk) await checkCoreCutover(leaf.path);
}

if (coreOk && failures.length === 0) {
  console.log('\nOK  Cutover active — audit + backup only on leaf services.');
  console.log('    Rollback: re-add AuditModule/BackupModule to capexbe + unset env vars');
}

if (failures.length) {
  console.error('\nPhase 2 shadow test FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nPhase 2 shadow test PASSED');
