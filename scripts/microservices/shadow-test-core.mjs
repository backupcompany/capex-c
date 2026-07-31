#!/usr/bin/env node
/** Phase 7e shadow test — core hub leaf (bootstrap + project-list + budget-hu). */
const CORE = process.env.NEXT_PUBLIC_CAPEXBE_URL || 'http://127.0.0.1:3001';
const LEAF = process.env.CAPEX_SERVICE_CORE_URL || 'http://127.0.0.1:3016';
const ENV_VAR = 'CAPEX_SERVICE_CORE_URL';
const PATHS = ['/bootstrap', '/project-list/query', '/budget-hu/page-bundle'];
const failures = [];

async function getJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
  return { status: res.status };
}

console.log('=== CAPEX Phase 7e shadow test: core hub ===\n');
if (!process.env[ENV_VAR]?.trim()) failures.push(`${ENV_VAR} not set`);
else console.log(`OK  BFF env ${ENV_VAR}=${process.env[ENV_VAR]?.trim()}`);

for (const [name, base] of [
  ['capexbe (core/auth gateway)', CORE],
  ['capex-core (leaf)', LEAF],
]) {
  try {
    const { status } = await getJson(`${base.replace(/\/$/, '')}/health`);
    if (status !== 200) failures.push(`${name} health → ${status}`);
    else console.log(`OK  ${name} health → 200`);
  } catch (e) {
    failures.push(`${name} unreachable: ${e instanceof Error ? e.message : e}`);
  }
}

for (const path of PATHS) {
  for (const [label, base, expect] of [
    ['leaf', LEAF, 401],
    ['core', CORE, 404],
  ]) {
    const { status } = await getJson(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 1, periodName: 'test' }),
    });
    if (status !== expect) failures.push(`${label} ${path} → expected ${expect}, got ${status}`);
    else console.log(`OK  ${label} ${path} → ${status}`);
  }
}

if (failures.length) {
  console.error('\nPhase 7e shadow test FAILED:', failures);
  process.exit(1);
}
console.log('\nPhase 7e shadow test PASSED');
console.log('    Monolith is auth-only — domain HTTP on leaf services.');
