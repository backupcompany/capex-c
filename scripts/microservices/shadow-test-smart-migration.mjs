#!/usr/bin/env node
/** Phase 8 shadow test — smart-migration leaf. */
const CORE = process.env.NEXT_PUBLIC_CAPEXBE_URL || 'http://127.0.0.1:3001';
const LEAF = process.env.CAPEX_SERVICE_SMART_MIGRATION_URL || 'http://127.0.0.1:3017';
const ENV_VAR = 'CAPEX_SERVICE_SMART_MIGRATION_URL';
const PATH = '/smart-migration/progress';
const failures = [];

async function getJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
  return { status: res.status };
}

console.log('=== CAPEX Phase 8 shadow test: smart-migration ===\n');
if (!process.env[ENV_VAR]?.trim()) failures.push(`${ENV_VAR} not set`);
else console.log(`OK  BFF env ${ENV_VAR}=${process.env[ENV_VAR]?.trim()}`);

for (const [name, base] of [
  ['capexbe (auth gateway)', CORE],
  ['capex-smart-migration (leaf)', LEAF],
]) {
  try {
    const { status } = await getJson(`${base.replace(/\/$/, '')}/health`);
    if (status !== 200) failures.push(`${name} health → ${status}`);
    else console.log(`OK  ${name} health → 200`);
  } catch (e) {
    failures.push(`${name} unreachable: ${e instanceof Error ? e.message : e}`);
  }
}

for (const [label, base] of [['leaf', LEAF], ['core', CORE]]) {
  const { status } = await getJson(`${base.replace(/\/$/, '')}${PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 1, jobId: 'test' }),
  });
  const expect = label === 'leaf' ? 401 : 404;
  if (status !== expect) failures.push(`${label} ${PATH} → expected ${expect}, got ${status}`);
  else console.log(`OK  ${label} ${PATH} → ${status}`);
}

if (failures.length) {
  console.error('\nPhase 8 shadow test FAILED:', failures);
  process.exit(1);
}
console.log('\nPhase 8 shadow test PASSED');
console.log('    Monolith is auth-only — all domain HTTP on leaf services.');
