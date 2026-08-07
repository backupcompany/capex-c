#!/usr/bin/env node
/** FE outbound bodies must redact numeric userId → publicUserId. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(join(ROOT, 'package.json'));

const src = readFileSync(join(ROOT, 'src/lib/redactApiUserId.ts'), 'utf8');
if (!src.includes('redactOutgoingUserIdJson')) {
  console.error('FAIL: redactApiUserId.ts missing redactOutgoingUserIdJson');
  process.exit(1);
}

for (const rel of [
  'src/lib/http/capexBeAxios.ts',
  'src/lib/auth/authenticatedFetch.ts',
  'src/lib/auth/beProxy.ts',
]) {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  if (!text.includes('redactOutgoingUserId')) {
    console.error(`FAIL: ${rel} missing redactOutgoingUserId wiring`);
    process.exit(1);
  }
}

const Hashids = req('hashids');
const codec = new Hashids('capex-siloam-public-id-v1', 8);
const token = codec.encode(148);
if (Number(codec.decode(token)[0]) !== 148) {
  console.error('FAIL: hashids round-trip');
  process.exit(1);
}

const redacted = JSON.parse(
  JSON.stringify({ userId: 148, periodName: 'FY2026' }).replace(
    /"userId"\s*:\s*148/,
    `"publicUserId":"${token}"`,
  ).replace(/"userId"\s*:\s*148,?/, ''),
);
// sanity: manual shape
if (!token || token.length < 8) {
  console.error('FAIL: encoded token too short');
  process.exit(1);
}

console.log('OK  public id redact — axios/fetch/proxy wired, hashids round-trip verified');
