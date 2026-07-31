#!/usr/bin/env node
/** Phase 7d shadow test — tasks leaf (my-tasks + task-actions). */
const CORE = process.env.NEXT_PUBLIC_CAPEXBE_URL || 'http://127.0.0.1:3001';
const LEAF = process.env.CAPEX_SERVICE_TASKS_URL || 'http://127.0.0.1:3015';
const ENV_VAR = 'CAPEX_SERVICE_TASKS_URL';
const PATHS = ['/my-tasks', '/task-actions/complete-workflow'];
const failures = [];

async function getJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
  return { status: res.status };
}

console.log('=== CAPEX Phase 7d shadow test: tasks ===\n');
if (!process.env[ENV_VAR]?.trim()) failures.push(`${ENV_VAR} not set`);
else console.log(`OK  BFF env ${ENV_VAR}=${process.env[ENV_VAR]?.trim()}`);

for (const [name, base] of [
  ['capexbe (core)', CORE],
  ['capex-tasks (leaf)', LEAF],
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
  console.error('\nPhase 7d shadow test FAILED:', failures);
  process.exit(1);
}
console.log('\nPhase 7d shadow test PASSED');
