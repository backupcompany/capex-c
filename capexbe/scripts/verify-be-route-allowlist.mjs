#!/usr/bin/env node
/**
 * Ensure capexbe BE_ROUTE_PREFIXES stays aligned with FE bePathAllowlist (minus auth/ which is BE-only extras).
 * Run: node scripts/verify-be-route-allowlist.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FE = join(ROOT, '..', 'capex-apps', 'src', 'lib', 'auth', 'bePathAllowlist.ts');
const BE = join(ROOT, 'src', 'shared', 'be-route-allowlist.util.ts');

function extractPrefixes(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`Marker ${marker} not found`);
  const slice = src.slice(start);
  const match = slice.match(/\[([\s\S]*?)\]\s*as const/);
  if (!match) throw new Error('Could not parse prefix array');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

const fePrefixes = extractPrefixes(readFileSync(FE, 'utf8'), 'ALLOWED_PATH_PREFIXES');
const beAll = extractPrefixes(readFileSync(BE, 'utf8'), 'BE_ROUTE_PREFIXES');
const bePrefixes = beAll.filter((p) => p !== 'auth/').sort();

const missingInBe = fePrefixes.filter((p) => !bePrefixes.includes(p));
const extraInBe = bePrefixes.filter((p) => !fePrefixes.includes(p));

if (missingInBe.length || extraInBe.length) {
  console.error('BE route allowlist drift detected:');
  if (missingInBe.length) console.error('  Missing in BE:', missingInBe.join(', '));
  if (extraInBe.length) console.error('  Extra in BE (non-auth):', extraInBe.join(', '));
  process.exit(1);
}

console.log('OK  BE route allowlist — synced with FE bePathAllowlist.ts');
