#!/usr/bin/env node
/**
 * Verify strangler-fig service route config — prefixes align with bePathAllowlist.
 * Run: node scripts/verify-service-routes.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST = join(ROOT, 'src/lib/auth/bePathAllowlist.ts');
const ROUTES = join(ROOT, 'src/lib/auth/serviceRoutes.ts');

function extractPrefixes(src, pattern) {
  const block = src.match(pattern);
  if (!block) return [];
  return [...block[0].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/\/+$/, ''));
}

const allowSrc = readFileSync(ALLOWLIST, 'utf8');
const routesSrc = readFileSync(ROUTES, 'utf8');

const allowed = extractPrefixes(allowSrc, /ALLOWED_PATH_PREFIXES = \[([\s\S]*?)\] as const/);
const routeNames = [...routesSrc.matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
const routePrefixes = [...routesSrc.matchAll(/prefixes: \[([\s\S]*?)\]/g)].flatMap((m) =>
  [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1].replace(/\/+$/, '')),
);

const failures = [];

for (const prefix of routePrefixes) {
  const ok = allowed.some((a) => a === prefix || a.replace(/\/$/, '') === prefix);
  if (!ok) failures.push(`Service route prefix "${prefix}" not in bePathAllowlist.ts`);
}

const envVars = [...routesSrc.matchAll(/envVar: '(CAPEX_SERVICE_[^']+)'/g)].map((m) => m[1]);
if (envVars.length !== new Set(envVars).size) {
  failures.push('Duplicate envVar in EXTRACTABLE_SERVICE_ROUTES');
}

if (failures.length) {
  console.error('Service route verification failed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `OK  service routes — ${routeNames.length} extractable domains (${routeNames.join(', ')}), ${allowed.length} BFF allowlist prefixes`,
);
