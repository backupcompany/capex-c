#!/usr/bin/env node
/**
 * Static gate — no localhost URLs, default secrets, or markdown-in-YAML in prod-critical paths.
 * Usage: node scripts/microservices/verify-no-prod-hardcode.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const failures = [];
const warnings = [];

/** Paths relative to repo root. */
const SCAN_ROOTS = [
  'capex-apps/src',
  'capexbe/src',
  'services',
  'deploy',
];

const EXT_OK = new Set(['.ts', '.tsx', '.js', '.mjs', '.yml', '.yaml']);

const FILE_ALLOWLIST = [
  /ipAllowlist\.ts$/,
  /metrics-access\.util\.ts$/,
  /demo-mode\.util\.ts$/,
  /prod-env\.util\.ts$/,
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /node_modules/,
  /\/dist\//,
];

const CONTENT_RULES = [
  {
    id: 'localhost-url',
    re: /['"`]https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?[^'"`]*['"`]/g,
    label: 'hardcoded localhost/127.0.0.1 URL string',
    skipExt: new Set(['.yml', '.yaml']),
  },
  {
    id: 'default-jwt',
    re: /change-me-use-openssl-rand-base64-48/g,
    label: 'default JWT secret literal',
    skipPaths: [/\.env\.example$/, /prod-env\.util\.ts$/],
  },
  {
    id: 'next-public-supabase',
    re: /NEXT_PUBLIC_SUPABASE_(?:URL|ANON_KEY)/g,
    label: 'NEXT_PUBLIC_SUPABASE_* in source (must stay server-only)',
    onlyExt: new Set(['.ts', '.tsx']),
  },
  {
    id: 'markdown-in-yaml',
    re: /^```/m,
    label: 'markdown code fence inside YAML',
    onlyExt: new Set(['.yml', '.yaml']),
  },
];

function walk(dir, files = []) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return files;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(ROOT, p);
    if (FILE_ALLOWLIST.some((rx) => rx.test(rel))) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else {
      const ext = name.slice(name.lastIndexOf('.'));
      if (EXT_OK.has(ext)) files.push(p);
    }
  }
  return files;
}

function lineHits(text, re) {
  const hits = [];
  const lineRe = new RegExp(re.source, re.flags.replace('g', ''));
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lineRe.test(lines[i])) hits.push(i + 1);
  }
  return hits;
}

function checkFile(absPath) {
  const rel = relative(ROOT, absPath);
  const ext = absPath.slice(absPath.lastIndexOf('.'));

  if (rel.endsWith('.env.example')) return;

  const text = readFileSync(absPath, 'utf8');

  for (const rule of CONTENT_RULES) {
    if (rule.onlyExt && !rule.onlyExt.has(ext)) continue;
    if (rule.skipExt?.has(ext)) continue;
    if (rule.skipPaths?.some((rx) => rx.test(rel))) continue;

    const lines = lineHits(text, rule.re);
    if (!lines.length) continue;

    // Dev-only CORS fallback in leaf main.ts — runtime guard blocks prod without CORS_ORIGINS.
    if (rule.id === 'localhost-url' && /services\/capex-[^/]+\/src\/main\.ts$/.test(rel)) {
      warnings.push(`${rel}:${lines[0]} — ${rule.label} (dev fallback; prod blocked by assertProductionCors)`);
      continue;
    }

    failures.push(`${rel}:${lines.join(',')} — ${rule.label}`);
  }
}

console.log('=== CAPEX no-prod-hardcode scan ===\n');

for (const rootRel of SCAN_ROOTS) {
  const abs = join(ROOT, rootRel);
  if (!existsSync(abs)) {
    warnings.push(`scan root missing: ${rootRel}`);
    continue;
  }
  for (const file of walk(abs)) checkFile(file);
}

// deploy/.env.compose must not ship with placeholders if present locally
const composeEnv = join(ROOT, 'deploy/.env.compose');
if (existsSync(composeEnv)) {
  const envText = readFileSync(composeEnv, 'utf8');
  if (/YOUR_PROJECT_REF|change-me/i.test(envText)) {
    failures.push('deploy/.env.compose still contains placeholder values');
  }
  if (!envText.includes('JWT_ACCESS_SECRET=') || /JWT_ACCESS_SECRET=\s*$/m.test(envText)) {
    failures.push('deploy/.env.compose missing JWT_ACCESS_SECRET');
  }
}

// BFF must not re-export dead localhost API base
const configTs = join(ROOT, 'capex-apps/src/lib/config.ts');
if (existsSync(configTs)) {
  const cfg = readFileSync(configTs, 'utf8');
  if (/API_BASE_URL.*localhost/.test(cfg)) {
    failures.push('capex-apps/src/lib/config.ts exports localhost API_BASE_URL');
  }
}

if (warnings.length) {
  console.warn('Warnings:');
  for (const w of warnings) console.warn(`  - ${w}`);
  console.warn('');
}

if (failures.length) {
  console.error('No-prod-hardcode scan FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('OK  no-prod-hardcode scan passed');
