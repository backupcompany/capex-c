#!/usr/bin/env node
/**
 * Static audit: senior middleware stack — BFF allowlist, edge policy, no orphan routes.
 * Run: node scripts/verify-middleware-security.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BE_SRC = join(ROOT, '..', 'capexbe', 'src');

const FORBIDDEN_ALLOWLIST = ['ai-analytics/', 'bdd-construction/'];

const REQUIRED_EDGE_CHECKS = [
  {
    file: 'src/lib/auth/edgeApiPolicy.ts',
    mustInclude: ['HEALTH_PUBLIC_PREFIXES'],
    label: 'health routes public',
  },
  {
    file: 'src/lib/auth/edgeApiPolicy.ts',
    mustInclude: ["if (pathname.startsWith('/api/')) return 'deny'"],
    label: 'unknown /api/* → deny',
  },
  {
    file: 'src/lib/auth/edgeApiPolicy.ts',
    mustInclude: ['if (!header) return false'],
    label: 'CSRF header required on /api/be',
  },
  {
    file: 'src/lib/auth/edgeSession.ts',
    mustInclude: ['edgeSessionPermitsBeProxy'],
    label: '/api/be requires valid access JWT',
  },
  {
    file: 'middleware.ts',
    mustInclude: [
      'edgeSessionPermitsBeProxy',
      'generateCspNonce',
      'x-nonce',
      'applySecurityHeaders',
      'buildContentSecurityPolicy',
      'Content-Security-Policy',
      'requestIsHttps',
    ],
    label: 'middleware BE proxy gate + CSP nonce on request',
  },
  {
    file: 'app/layout.tsx',
    mustInclude: ['force-dynamic', 'headers()', 'x-nonce'],
    label: 'root layout dynamic SSR for CSP nonce',
  },
  {
    file: 'src/lib/security/csp.ts',
    mustInclude: ["'strict-dynamic'", 'upgrade-insecure-requests', 'requestIsHttps', 'enforceHttps'],
    label: 'CSP builder gates HTTPS upgrades on proto',
  },
  {
    file: 'next.config.ts',
    mustInclude: ['Dev-only CSP', 'if (isProd) return []'],
    label: 'next.config defers prod CSP to middleware',
  },
  {
    file: 'src/lib/auth/beProxy.ts',
    mustInclude: ['isAllowedBePath'],
    label: 'BFF path allowlist enforced',
  },
];

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Avoid `/\/+$/` (Sonar S8786 backtracking) — scripts only. */
function stripTrailingSlashes(path) {
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 47 /* / */) end -= 1;
  return end === path.length ? path : path.slice(0, end);
}

/** Parse `@Controller('x')` without unbounded `\s*` backtracking. */
function nestControllerBase(text) {
  const marker = '@Controller(';
  const start = text.indexOf(marker);
  if (start < 0) return '';
  let i = start + marker.length;
  while (i < text.length && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) {
    i += 1;
  }
  const quote = text[i];
  if (quote !== "'" && quote !== '"' && quote !== '`') return '';
  i += 1;
  const from = i;
  while (i < text.length && text[i] !== quote) i += 1;
  return text.slice(from, i);
}

function extractAllowlistPrefixes() {
  const src = read('src/lib/auth/bePathAllowlist.ts');
  const marker = 'ALLOWED_PATH_PREFIXES';
  const start = src.indexOf(marker);
  if (start < 0) return [];
  const bracket = src.indexOf('[', start);
  if (bracket < 0) return [];
  const end = src.indexOf('] as const', bracket);
  if (end < 0) return [];
  const body = src.slice(bracket + 1, end);
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function collectBeControllerRoutes(dir) {
  const routes = new Set();
  function walk(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.controller.ts')) {
        const text = readFileSync(p, 'utf8');
        const base = nestControllerBase(text);
        for (const m of text.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s{0,8}['"`]([^'"`]*)['"`]/g)) {
          const segment = m[2];
          const full = [base, segment]
            .filter(Boolean)
            .join('/')
            .split('/')
            .filter(Boolean)
            .join('/');
          if (full) routes.add(full);
        }
        for (const m of text.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s{0,8}\)/g)) {
          if (base) routes.add(base);
        }
      }
    }
  }
  if (statSync(BE_SRC, { throwIfNoEntry: false })?.isDirectory()) walk(BE_SRC);
  return routes;
}

function prefixHasController(prefix, routes) {
  const norm = stripTrailingSlashes(prefix);
  for (const route of routes) {
    if (route === norm || route.startsWith(`${norm}/`)) return true;
    if (norm.startsWith(route) || norm.startsWith(`${route}/`)) return true;
  }
  return false;
}

function main() {
  const failures = [];
  const warnings = [];

  for (const check of REQUIRED_EDGE_CHECKS) {
    const text = read(check.file);
    if (!check.mustInclude.every((s) => text.includes(s))) {
      failures.push(`Missing ${check.label} in ${check.file}`);
    }
  }

  const allowlist = extractAllowlistPrefixes();
  for (const forbidden of FORBIDDEN_ALLOWLIST) {
    if (allowlist.includes(forbidden)) {
      failures.push(`Allowlist still includes unimplemented route: ${forbidden}`);
    }
  }

  const beRoutes = collectBeControllerRoutes(BE_SRC);
  for (const prefix of allowlist) {
    if (!prefixHasController(prefix, beRoutes)) {
      warnings.push(`Allowlist prefix "${prefix}" has no matching capexbe @Controller route`);
    }
  }

  const apiRoutesDir = join(ROOT, 'app', 'api');
  const apiRouteFiles = [];
  function walkApi(d, base = '') {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walkApi(p, `${base}/${name}`);
      else if (name === 'route.ts') apiRouteFiles.push(stripTrailingSlashes(`${base}/`) || '/');
    }
  }
  walkApi(apiRoutesDir);

  const toApiPath = (routePath) => `/api${routePath === '/' ? '' : routePath}`;

  const policySrc = read('src/lib/auth/edgeApiPolicy.ts');
  for (const routePath of apiRouteFiles) {
    // Next dynamic segments `[id]` → sample token (avoid reluctant-regex Sonar S8786).
    const sample = toApiPath(routePath)
      .split('/')
      .map((seg) => (seg.startsWith('[') && seg.endsWith(']') ? 'test' : seg))
      .join('/');
    if (
      !policySrc.includes('AUTH_PUBLIC_PREFIXES') &&
      !policySrc.includes('AUTH_SESSION_PREFIXES') &&
      !policySrc.includes('PROTECTED_API_PREFIXES')
    ) {
      break;
    }
    const covered =
      sample.startsWith('/api/health') ||
      sample.startsWith('/api/auth/login') ||
      sample.startsWith('/api/auth/dev-enter') ||
      sample.startsWith('/api/auth/refresh') ||
      sample.startsWith('/api/auth/clear-cookies') ||
      sample.startsWith('/api/auth/exchange') ||
      sample.startsWith('/api/auth/forgot-password') ||
      sample.startsWith('/api/auth/azure') ||
      sample.startsWith('/api/auth/session') ||
      sample.startsWith('/api/auth/logout') ||
      sample.startsWith('/api/auth/heartbeat') ||
      sample.startsWith('/api/auth/change-password') ||
      sample.startsWith('/api/be');
    if (!covered) {
      failures.push(`API route not classified in edgeApiPolicy: ${toApiPath(routePath)}`);
    }
  }

  if (warnings.length) {
    console.warn('WARN middleware audit:');
    for (const w of warnings) console.warn(`  - ${w}`);
  }

  if (failures.length) {
    console.error('FAIL middleware audit:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`OK  middleware audit — ${allowlist.length} allowlist prefixes, ${beRoutes.size} BE routes, ${apiRouteFiles.length} API handlers`);
}

main();
