#!/usr/bin/env node
/** Phase 10 shadow test — auth leaf. */
const CORE = process.env.NEXT_PUBLIC_CAPEXBE_URL || 'http://127.0.0.1:3001';
const LEAF = process.env.CAPEX_SERVICE_AUTH_URL || 'http://127.0.0.1:3018';
const ENV_VAR = 'CAPEX_SERVICE_AUTH_URL';
const PATH = '/auth/heartbeat';
const failures = [];

async function getJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
  return { status: res.status };
}

console.log('=== CAPEX Phase 10 shadow test: auth ===\n');
if (!process.env[ENV_VAR]?.trim()) failures.push(`${ENV_VAR} not set`);
else console.log(`OK  BFF env ${ENV_VAR}=${process.env[ENV_VAR]?.trim()}`);

for (const [name, base] of [
  ['capexbe (health gateway)', CORE],
  ['capex-auth (leaf)', LEAF],
]) {
  try {
    const { status } = await getJson(`${base.replace(/\/$/, '')}/health`);
    if (status !== 200) failures.push(`${name} health → ${status}`);
    else console.log(`OK  ${name} health → 200`);
  } catch (e) {
    failures.push(`${name} unreachable: ${e instanceof Error ? e.message : e}`);
  }
}

for (const [label, base] of [
  ['leaf', LEAF],
  ['core', CORE],
]) {
  const { status } = await getJson(`${base.replace(/\/$/, '')}${PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const expect = label === 'leaf' ? 401 : 404;
  if (status !== expect) failures.push(`${label} ${PATH} → expected ${expect}, got ${status}`);
  else console.log(`OK  ${label} ${PATH} → ${status}`);
}

if (failures.length) {
  console.error('\nPhase 10 shadow test FAILED:', failures);
  process.exit(1);
}
console.log('\nPhase 10 shadow test PASSED');
console.log('    Monolith is health-only — auth HTTP on capex-auth leaf.');
