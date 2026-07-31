#!/usr/bin/env node
/**
 * Phase 5a shadow test — mom-daily-summary leaf service.
 * Usage: make shadow-mom-daily-summary
 */
const CORE = process.env.NEXT_PUBLIC_CAPEXBE_URL || 'http://127.0.0.1:3001';
const LEAF = process.env.CAPEX_SERVICE_MOM_DAILY_SUMMARY_URL || 'http://127.0.0.1:3006';
const PATH = '/mom-daily-summary/rows';
const ENV_VAR = 'CAPEX_SERVICE_MOM_DAILY_SUMMARY_URL';

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
      body: JSON.stringify({ periodName: 'test', summaryDate: '2026-01-01' }),
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

console.log('=== CAPEX Phase 5a shadow test: mom-daily-summary ===\n');
console.log(`Core API: ${CORE}`);
console.log(`Leaf API: ${LEAF}\n`);

const override = process.env[ENV_VAR]?.trim();
if (!override) failures.push(`${ENV_VAR} not set (add to capex-apps/.env.local)`);
else console.log(`OK  BFF env ${ENV_VAR}=${override}`);

const coreOk = await checkHealth('capexbe (core)', CORE);
const leafOk = await checkHealth('capex-mom-daily-summary (leaf)', LEAF);

if (leafOk) await checkAuthGate('capex-mom-daily-summary', LEAF);

if (coreOk) {
  const { status } = await getJson(`${CORE.replace(/\/$/, '')}${PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ periodName: 'test', summaryDate: '2026-01-01' }),
  });
  if (status !== 404) {
    failures.push(`capexbe ${PATH} after cutover → expected 404, got ${status}`);
  } else {
    console.log(`OK  capexbe ${PATH} → 404 (cutover — route removed from monolith)`);
  }
}

if (coreOk && leafOk && failures.length === 0) {
  console.log('\nOK  Cutover active — mom-daily-summary only on leaf service.');
  console.log('    Rollback: re-add MomDailySummaryModule to capexbe + unset env var');
}

if (failures.length) {
  console.error('\nPhase 5a shadow test FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nPhase 5a shadow test PASSED');
