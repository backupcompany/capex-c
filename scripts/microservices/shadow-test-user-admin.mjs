#!/usr/bin/env node
/**
 * Phase 5d shadow test — user-admin leaf service.
 * Usage: make shadow-user-admin
 */
const CORE = process.env.NEXT_PUBLIC_CAPEXBE_URL || 'http://127.0.0.1:3001';
const LEAF = process.env.CAPEX_SERVICE_USER_ADMIN_URL || 'http://127.0.0.1:3009';
const PATH = '/user-admin/bulk-delete';
const ENV_VAR = 'CAPEX_SERVICE_USER_ADMIN_URL';

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

async function checkAuthGate(name, base) {
  try {
    const { status } = await getJson(`${base.replace(/\/$/, '')}${PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 1, ids: [] }),
    });
    if (status !== 401) {
      failures.push(`${name} ${PATH} without auth → expected 401, got ${status}`);
      return false;
    }
    console.log(`OK  ${name} ${PATH} without auth → 401`);
    return true;
  } catch (e) {
    failures.push(`${name} ${PATH} failed: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

console.log('=== CAPEX Phase 5d shadow test: user-admin ===\n');
console.log(`Core API: ${CORE}`);
console.log(`Leaf API: ${LEAF}\n`);

const override = process.env[ENV_VAR]?.trim();
if (!override) failures.push(`${ENV_VAR} not set (add to capex-apps/.env.local)`);
else console.log(`OK  BFF env ${ENV_VAR}=${override}`);

const coreOk = await checkHealth('capexbe (core)', CORE);
const leafOk = await checkHealth('capex-user-admin (leaf)', LEAF);

if (leafOk) await checkAuthGate('capex-user-admin', LEAF);

if (coreOk) {
  const { status } = await getJson(`${CORE.replace(/\/$/, '')}${PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 1, ids: [] }),
  });
  if (status !== 404) {
    failures.push(`capexbe ${PATH} after cutover → expected 404, got ${status}`);
  } else {
    console.log(`OK  capexbe ${PATH} → 404 (cutover — route removed from monolith)`);
  }
}

if (coreOk && leafOk && failures.length === 0) {
  console.log('\nOK  Cutover active — user-admin only on leaf service.');
  console.log('    Rollback: re-add UserAdminModule to capexbe + unset env var');
}

if (failures.length) {
  console.error('\nPhase 5d shadow test FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nPhase 5d shadow test PASSED');
