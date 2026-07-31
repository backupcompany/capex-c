#!/usr/bin/env node
/**
 * Phase 12 — verify extracted domain packages (notifications, audit, …).
 * Usage: make verify-phase12-domains
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];

const DOMAINS = [
  {
    name: 'notifications',
    pkg: 'capex-notifications-core',
    leaf: 'capex-notifications',
    shim: 'capexbe/src/notifications/notifications.module.ts',
    bePrefix: '@capexbe/notifications/',
  },
  {
    name: 'audit',
    pkg: 'capex-audit-core',
    leaf: 'capex-audit',
    shim: 'capexbe/src/audit/audit.module.ts',
    bePrefix: '@capexbe/audit/',
  },
];

for (const d of DOMAINS) {
  const pkgIndex = join(ROOT, 'packages', d.pkg, 'src/index.ts');
  if (!existsSync(pkgIndex)) failures.push(`missing packages/${d.pkg}`);

  const leafApp = join(ROOT, 'services', d.leaf, 'src/app.module.ts');
  if (!existsSync(leafApp)) {
    failures.push(`missing services/${d.leaf}`);
    continue;
  }
  const leaf = readFileSync(leafApp, 'utf8');
  const pkgImport = `@capex/${d.name}-core`;
  if (!leaf.includes(pkgImport)) {
    failures.push(`${d.leaf} must import ${pkgImport}`);
  }
  if (leaf.includes(d.bePrefix)) {
    failures.push(`${d.leaf} must not import ${d.bePrefix}*`);
  }

  const shimPath = join(ROOT, d.shim);
  if (existsSync(shimPath)) {
    const shim = readFileSync(shimPath, 'utf8');
    if (!shim.includes(pkgImport)) {
      failures.push(`${d.shim} must re-export ${pkgImport}`);
    }
  }

  const pkgJson = join(ROOT, 'services', d.leaf, 'package.json');
  if (existsSync(pkgJson)) {
    const deps = JSON.parse(readFileSync(pkgJson, 'utf8')).dependencies ?? {};
    if (!deps[pkgImport]) failures.push(`${d.leaf} package.json missing ${pkgImport}`);
  }
}

if (failures.length) {
  console.error('Phase 12 domain extraction verify FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`OK  Phase 12 — ${DOMAINS.length} domain packages extracted (notifications, audit)`);
