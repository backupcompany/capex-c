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

/** Avoid `/\/+$/` (Sonar S8786). */
function stripTrailingSlashes(path) {
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 47 /* / */) end -= 1;
  return end === path.length ? path : path.slice(0, end);
}

function extractPrefixes(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return [];
  const bracket = src.indexOf('[', start);
  if (bracket < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = bracket; i < src.length; i += 1) {
    if (src[i] === '[') depth += 1;
    else if (src[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return [];
  return [...src.slice(bracket + 1, end).matchAll(/'([^']+)'/g)].map((m) => stripTrailingSlashes(m[1]));
}

const allowSrc = readFileSync(ALLOWLIST, 'utf8');
const routesSrc = readFileSync(ROUTES, 'utf8');

const allowed = extractPrefixes(allowSrc, 'ALLOWED_PATH_PREFIXES');
const routeNames = [...routesSrc.matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
const routePrefixes = [];
let searchFrom = 0;
while (true) {
  const idx = routesSrc.indexOf('prefixes:', searchFrom);
  if (idx < 0) break;
  routePrefixes.push(...extractPrefixes(routesSrc.slice(idx), 'prefixes:'));
  searchFrom = idx + 9;
}

const failures = [];

for (const prefix of routePrefixes) {
  const ok = allowed.some((a) => a === prefix || stripTrailingSlashes(a) === prefix);
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
