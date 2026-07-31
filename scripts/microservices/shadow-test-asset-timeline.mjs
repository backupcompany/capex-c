#!/usr/bin/env node
/**
 * Phase 5b shadow test — asset-timeline leaf service.
 * Usage: make shadow-asset-timeline
 */
const CORE = process.env.NEXT_PUBLIC_CAPEXBE_URL || 'http://127.0.0.1:3001';
const LEAF = process.env.CAPEX_SERVICE_ASSET_TIMELINE_URL || 'http://127.0.0.1:3007';
const PATH = '/asset-timeline';
const ENV_VAR = 'CAPEX_SERVICE_ASSET_TIMELINE_URL';

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
      body: JSON.stringify({ assetId: 'a', workflowSetId: 'w', userId: 1 }),
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

console.log('=== CAPEX Phase 5b shadow test: asset-timeline ===\n');
console.log(`Core API: ${CORE}`);
console.log(`Leaf API: ${LEAF}\n`);

const override = process.env[ENV_VAR]?.trim();
if (!override) failures.push(`${ENV_VAR} not set (add to capex-apps/.env.local)`);
else console.log(`OK  BFF env ${ENV_VAR}=${override}`);

const coreOk = await checkHealth('capexbe (core)', CORE);
const leafOk = await checkHealth('capex-asset-timeline (leaf)', LEAF);

if (leafOk) await checkAuthGate('capex-asset-timeline', LEAF);

if (coreOk) {
  const { status } = await getJson(`${CORE.replace(/\/$/, '')}${PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId: 'a', workflowSetId: 'w', userId: 1 }),
  });
  if (status !== 404) {
    failures.push(`capexbe ${PATH} after cutover → expected 404, got ${status}`);
  } else {
    console.log(`OK  capexbe ${PATH} → 404 (cutover — route removed from monolith)`);
  }
}

if (coreOk && leafOk && failures.length === 0) {
  console.log('\nOK  Cutover active — asset-timeline only on leaf service.');
  console.log('    Rollback: re-add AssetTimelineModule to capexbe + unset env var');
}

if (failures.length) {
  console.error('\nPhase 5b shadow test FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nPhase 5b shadow test PASSED');
