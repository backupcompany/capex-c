#!/usr/bin/env node
/**
 * Probe BFF aggregated health (requires FE :3000 + backend services).
 * Usage: make verify-bff-health
 */
const BFF = (process.env.BFF_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const failures = [];

async function main() {
  console.log('=== CAPEX BFF health verify ===\n');
  console.log(`GET ${BFF}/api/health/services\n`);

  let res;
  try {
    res = await fetch(`${BFF}/api/health/services`, { signal: AbortSignal.timeout(15000) });
  } catch (e) {
    failures.push(`BFF unreachable at ${BFF} — run: make run-fe (and leaf stack)`);
    console.error(failures[0], e instanceof Error ? e.message : e);
    process.exit(1);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    failures.push('Invalid JSON from /api/health/services');
    process.exit(1);
  }

  if (!body.gateway?.ok) failures.push(`gateway down (${body.gateway?.error ?? body.gateway?.status})`);
  else console.log(`OK  gateway → ${body.gateway.latencyMs}ms`);

  if (body.auth) {
    if (!body.auth.ok) failures.push(`auth leaf down (${body.auth.error ?? body.auth.status})`);
    else console.log(`OK  auth → ${body.auth.latencyMs}ms`);
  } else {
    failures.push('auth leaf not configured (CAPEX_SERVICE_AUTH_URL)');
  }

  const leaves = body.leaves ?? [];
  const expected = 16;
  if (leaves.length < expected) {
    failures.push(`only ${leaves.length}/${expected} leaf services configured in env`);
  }
  for (const leaf of leaves) {
    if (leaf.ok) console.log(`OK  ${leaf.name} → ${leaf.latencyMs}ms`);
    else failures.push(`${leaf.name} down (${leaf.error ?? leaf.status})`);
  }

  if (failures.length) {
    console.error('\nBFF health verify FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`\nBFF health verify PASSED (${leaves.length} leaves + gateway + auth)`);
}

main();
