#!/usr/bin/env node
/** Blocks loopback SUPABASE_URL in production when not VPS-tunnel mode. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function wouldBlock(env) {
  if (env.NODE_ENV !== 'production') return false;
  const useVps = env.USE_VPS_POSTGRES === '1' || env.USE_VPS_POSTGRES === 'true';
  const url = String(env.SUPABASE_URL || '').trim();
  if (!url) return false;
  if (useVps) return false;
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/i.test(url);
}

assert.equal(wouldBlock({ NODE_ENV: 'production', SUPABASE_URL: 'http://127.0.0.1:54321' }), true);
assert.equal(wouldBlock({ NODE_ENV: 'production', SUPABASE_URL: 'http://localhost:54321' }), true);
assert.equal(wouldBlock({ NODE_ENV: 'production', SUPABASE_URL: 'http://capex-postgrest' }), false);
assert.equal(
  wouldBlock({
    NODE_ENV: 'production',
    USE_VPS_POSTGRES: '1',
    SUPABASE_URL: 'http://127.0.0.1:54321',
  }),
  false,
);
assert.equal(wouldBlock({ NODE_ENV: 'development', SUPABASE_URL: 'http://127.0.0.1:54321' }), false);

const dir = dirname(fileURLToPath(import.meta.url));
const util = readFileSync(join(dir, 'prod-env.util.ts'), 'utf8');
assert.match(util, /capex-postgrest/, 'prod-env must mention Docker PostgREST host');
assert.match(util, /127\\.0\\.0\\.1\|localhost/, 'prod-env must block loopback SUPABASE_URL');

const compose = readFileSync(join(dir, '../../../deploy/docker-compose.siloam.yml'), 'utf8');
assert.match(compose, /SUPABASE_URL:\s*http:\/\/capex-postgrest/, 'compose must hardcode in-stack PostgREST URL');
assert.match(compose, /NOTIFY pgrst, 'reload schema'/, 'compose must reload PostgREST schema on start');
assert.doesNotMatch(
  compose,
  /SUPABASE_URL:\s*\$\{SUPABASE_URL/,
  'compose must not interpolate SUPABASE_URL from env_file (loopback trap)',
);

console.log('OK  prod-env supabase URL loopback guard');
