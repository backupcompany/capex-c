#!/usr/bin/env node
/** FE outbound bodies must redact numeric userId; client must not ship Hashids salt. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const publicUserId = readFileSync(join(ROOT, 'src/lib/publicUserId.ts'), 'utf8');
if (
  /from\s+['"]hashids['"]|require\(['"]hashids['"]\)|capex-siloam-public-id|PUBLIC_ID_SALT|NEXT_PUBLIC_PUBLIC_ID/i.test(
    publicUserId,
  )
) {
  console.error('FAIL: publicUserId.ts must not import Hashids or ship salt (cyber finding)');
  process.exit(1);
}
if (/\bencodeUserPublicId\b|\bdecodeUserPublicId\b/.test(publicUserId)) {
  console.error('FAIL: client publicUserId.ts must not encode/decode ids');
  process.exit(1);
}

console.log('OK  public id redact wired; client publicUserId has no Hashids salt');
