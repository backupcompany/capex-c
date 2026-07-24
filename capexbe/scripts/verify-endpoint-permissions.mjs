#!/usr/bin/env node
/**
 * Ensure protected controllers declare @RequirePermission, @RequireAnyPermission, or @Roles.
 * Run: node scripts/verify-endpoint-permissions.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const SKIP_CONTROLLERS = new Set([
  'app.controller.ts',
  'auth.controller.ts',
  'bootstrap.controller.ts',
]);

const GUARD_MARKERS = [
  '@RequirePermission',
  '@RequireAnyPermission',
  '@Roles(',
  '@Public()',
  '@TASK_READ',
  '@TASK_WRITE',
  '@CONFIG_READ',
  '@CONFIG_WRITE',
];

function walkControllers(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walkControllers(path, out);
    } else if (name.endsWith('.controller.ts')) {
      out.push(path);
    }
  }
  return out;
}

const failures = [];
for (const file of walkControllers(ROOT)) {
  const base = file.split('/').pop();
  if (SKIP_CONTROLLERS.has(base)) continue;

  const text = readFileSync(file, 'utf8');
  const posts = [...text.matchAll(/@Post\(/g)];
  if (posts.length === 0) continue;

  const hasGuardMarker = GUARD_MARKERS.some((m) => text.includes(m));
  if (!hasGuardMarker) {
    failures.push(`${base}: no @RequirePermission/@RequireAnyPermission/@Roles on controller`);
    continue;
  }

  const classGuard =
    /@(?:RequirePermission|RequireAnyPermission|Roles)\([\s\S]*?\)\s*\n@Controller/m.test(text) ||
    /@(?:TASK_READ|TASK_WRITE|CONFIG_READ|CONFIG_WRITE)\s*\n@Controller/m.test(text);
  if (classGuard) continue;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('@Post(')) continue;
    const window = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
    const ok = GUARD_MARKERS.some((m) => window.includes(m));
    if (!ok) {
      failures.push(`${base}: @Post near line ${i + 1} missing permission decorator`);
    }
  }
}

if (failures.length) {
  console.error('Endpoint permission verification FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('OK  endpoint permissions — controllers declare guard decorators');
