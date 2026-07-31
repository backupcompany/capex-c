#!/usr/bin/env node
/**
 * Phase 12 — notifications domain extracted to @capex/notifications-core.
 * Usage: make verify-phase12-notifications
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];

const PKG = join(ROOT, 'packages/capex-notifications-core/src/index.ts');
const LEAF_APP = join(ROOT, 'services/capex-notifications/src/app.module.ts');
const SHIM = join(ROOT, 'capexbe/src/notifications/notifications.module.ts');

for (const f of [
  PKG,
  join(ROOT, 'packages/capex-notifications-core/src/notifications.service.ts'),
  join(ROOT, 'packages/capex-notifications-core/src/notifications.controller.ts'),
  join(ROOT, 'packages/capex-notifications-core/src/notifications.module.ts'),
]) {
  if (!existsSync(f)) failures.push(`missing ${f}`);
}

if (existsSync(LEAF_APP)) {
  const leaf = readFileSync(LEAF_APP, 'utf8');
  if (!leaf.includes("@capex/notifications-core")) {
    failures.push('capex-notifications leaf must import @capex/notifications-core');
  }
  if (/@capexbe\/notifications\//.test(leaf)) {
    failures.push('capex-notifications leaf must not import @capexbe/notifications/*');
  }
}

if (existsSync(SHIM)) {
  const shim = readFileSync(SHIM, 'utf8');
  if (!shim.includes('@capex/notifications-core')) {
    failures.push('capexbe notifications shim must re-export from @capex/notifications-core');
  }
}

const pkg = join(ROOT, 'services/capex-notifications/package.json');
if (existsSync(pkg)) {
  const deps = JSON.parse(readFileSync(pkg, 'utf8')).dependencies ?? {};
  if (!deps['@capex/notifications-core']) {
    failures.push('capex-notifications package.json missing @capex/notifications-core');
  }
}

if (failures.length) {
  console.error('Phase 12 notifications verify FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('OK  Phase 12 — @capex/notifications-core extracted; leaf imports package');
