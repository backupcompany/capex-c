#!/usr/bin/env node
/**
 * Phase 1 shadow test — notifications leaf service vs monolith.
 * Usage (from repo root):
 *   make shadow-notifications
 * Requires: capexbe :3001 + capex-notifications :3002 running.
 */
const CORE = process.env.NEXT_PUBLIC_CAPEXBE_URL || process.env.CAPEXBE_URL || 'http://127.0.0.1:3001';
const LEAF = process.env.CAPEX_SERVICE_NOTIFICATIONS_URL || 'http://127.0.0.1:3002';
const LEAF_PATH = '/notifications/list';
const BODY = JSON.stringify({ userId: 1 });

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
    const { status } = await getJson(`${base.replace(/\/$/, '')}${LEAF_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: BODY,
    });
    if (status !== 401) {
      failures.push(`${name} ${LEAF_PATH} without auth → expected 401, got ${status}`);
      return false;
    }
    console.log(`OK  ${name} ${LEAF_PATH} without auth → 401 (guard active)`);
    return true;
  } catch (e) {
    failures.push(`${name} ${LEAF_PATH} failed: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

/** After cutover, monolith must not expose notifications routes. */
async function checkCoreCutover(base) {
  try {
    const { status } = await getJson(`${base.replace(/\/$/, '')}${LEAF_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: BODY,
    });
    if (status !== 404) {
      failures.push(`capexbe ${LEAF_PATH} after cutover → expected 404, got ${status}`);
      return false;
    }
    console.log(`OK  capexbe ${LEAF_PATH} → 404 (cutover — route removed from monolith)`);
    return true;
  } catch (e) {
    failures.push(`capexbe cutover check failed: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

function checkBffRoutingEnv() {
  const override = process.env.CAPEX_SERVICE_NOTIFICATIONS_URL?.trim();
  if (!override) {
    failures.push('CAPEX_SERVICE_NOTIFICATIONS_URL not set (add to capex-apps/.env.local for BFF shadow)');
    return false;
  }
  if (override.replace(/\/$/, '') !== LEAF.replace(/\/$/, '')) {
    console.log(`WARN CAPEX_SERVICE_NOTIFICATIONS_URL=${override} (script uses LEAF=${LEAF})`);
  }
  console.log(`OK  BFF env CAPEX_SERVICE_NOTIFICATIONS_URL=${override}`);
  return true;
}

console.log('=== CAPEX Phase 1 shadow test: notifications ===\n');
console.log(`Core API: ${CORE}`);
console.log(`Leaf API: ${LEAF}\n`);

checkBffRoutingEnv();

const coreOk = await checkHealth('capexbe (core)', CORE);
const leafOk = await checkHealth('capex-notifications (leaf)', LEAF);

if (coreOk) await checkCoreCutover(CORE);
if (leafOk) await checkAuthGate('capex-notifications', LEAF);

if (coreOk && leafOk) {
  console.log('\nOK  Cutover active — notifications only on leaf; BFF routes via CAPEX_SERVICE_NOTIFICATIONS_URL.');
  console.log('    Manual: make run + open My Tasks → notification bell.');
  console.log('    Rollback: re-add NotificationsModule to capexbe + unset env var');
}

if (failures.length) {
  console.error('\nShadow test FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nShadow test PASSED');
