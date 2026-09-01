/**
 * Self-check: role create must land in public.roles (PostgREST / VPS path).
 * Run: node capexbe/src/configuration/role-create.persist.selfcheck.mjs
 *
 * Requires local PostgREST (make ensure-vps-dev) pointing at VPS Postgres.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadBeEnv() {
  const envPath = resolve(process.cwd(), 'capexbe/.env');
  const text = readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadBeEnv();
const rawBase = (env.SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
const base = rawBase.endsWith('/rest/v1') ? rawBase : `${rawBase}/rest/v1`;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error('FAIL: missing SUPABASE_SERVICE_ROLE_KEY in capexbe/.env');
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const marker = `audit_role_${Date.now()}`;

async function main() {
  // Allocate next id (same idea as BE allocateNextRoleId)
  const listRes = await fetch(`${base}/roles?select=id&order=id.desc&limit=1`, { headers });
  if (!listRes.ok) throw new Error(`list roles ${listRes.status} ${await listRes.text()}`);
  const list = await listRes.json();
  const nextId = Number(list?.[0]?.id ?? 0) + 1;

  const upsertRes = await fetch(`${base}/roles`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ id: nextId, role_name: marker }),
  });
  // PostgREST may need on_conflict — try upsert via PATCH if POST fails
  let row;
  if (upsertRes.ok) {
    row = (await upsertRes.json())[0];
  } else {
    const up = await fetch(`${base}/roles?on_conflict=id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ id: nextId, role_name: marker }),
    });
    if (!up.ok) throw new Error(`upsert role ${up.status} ${await up.text()}`);
    row = (await up.json())[0];
  }

  const check = await fetch(
    `${base}/roles?role_name=eq.${encodeURIComponent(marker)}&select=id,role_name`,
    { headers },
  );
  if (!check.ok) throw new Error(`check ${check.status}`);
  const found = await check.json();
  if (!found.length || found[0].role_name !== marker) {
    throw new Error('FAIL: role not readable after write');
  }

  // cleanup
  await fetch(`${base}/roles?id=eq.${found[0].id}`, { method: 'DELETE', headers });

  console.log('PASS role persist roundtrip', { id: found[0].id, role_name: marker, via: base });
}

main().catch((e) => {
  console.error('FAIL', e.message || e);
  process.exit(1);
});
