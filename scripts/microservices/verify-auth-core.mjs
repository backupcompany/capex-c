#!/usr/bin/env node
/**
 * Verify @capex/auth-core — decorators + guards in package (Phase 3b/3c).
 * Usage: make verify-phase3
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PKG = join(ROOT, 'packages/capex-auth-core/src/index.ts');
const LEAF_DIRS = [
  'services/capex-notifications',
  'services/capex-audit',
  'services/capex-backup',
  'services/capex-config',
  'services/capex-mom-daily-summary',
  'services/capex-asset-timeline',
  'services/capex-duplicate-detection',
  'services/capex-user-admin',
  'services/capex-procurement',
  'services/capex-fs',
  'services/capex-monitoring',
  'services/capex-reporting',
  'services/capex-executive-summary',
  'services/capex-tasks',
  'services/capex-core',
  'services/capex-smart-migration',
  'services/capex-auth',
];

const failures = [];

if (!existsSync(PKG)) {
  failures.push('packages/capex-auth-core/src/index.ts missing');
}

const indexSrc = existsSync(PKG) ? readFileSync(PKG, 'utf8') : '';
for (const exp of ['AuthCoreModule', 'JwtAuthGuard', 'PermissionsGuard', 'Public']) {
  if (!indexSrc.includes(exp)) failures.push(`@capex/auth-core missing export: ${exp}`);
}

if (!indexSrc.includes("from './auth-core.module'")) {
  failures.push('Phase 3d: AuthCoreModule should export from package auth-core.module');
}

if (!existsSync(join(ROOT, 'packages/capex-auth-core/src/utils/request-access-token.util.ts'))) {
  failures.push('Phase 3d: request-access-token util missing from package');
}

const localDecorator = join(ROOT, 'packages/capex-auth-core/src/decorators/public.decorator.ts');
if (!existsSync(localDecorator)) {
  failures.push('Phase 3b: decorators not yet in package');
} else if (readFileSync(localDecorator, 'utf8').includes('capexbe/src/auth')) {
  failures.push('Phase 3b: public.decorator still bridges from capexbe');
}

const guardPath = join(ROOT, 'packages/capex-auth-core/src/guards/jwt-auth.guard.ts');
if (!existsSync(guardPath)) {
  failures.push('Phase 3c: guards/ missing in package');
} else if (readFileSync(guardPath, 'utf8').includes('capexbe/src/auth/guards')) {
  failures.push('Phase 3c: jwt-auth.guard should not re-bridge from capexbe guards');
}

for (const dir of LEAF_DIRS) {
  const pkgPath = join(ROOT, dir, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.dependencies?.['@capex/auth-core']) {
    failures.push(`${dir}/package.json missing @capex/auth-core dependency`);
  }

  const srcDir = join(ROOT, dir, 'src');
  if (!existsSync(srcDir)) continue;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.ts')) {
        const code = readFileSync(p, 'utf8');
        if (/@capexbe\/auth\/(guards|decorators)/.test(code)) {
          /* Runtime: @capexbe guards/decorators avoid Reflector DI split from package index */
        } else if (dir.endsWith('capex-auth') && /@capexbe\/auth\/(auth\.controller|auth\.service)/.test(code)) {
          /* Auth leaf: HTTP surface stays in capexbe until Phase 12 auth package extraction */
        } else if (/@capexbe\/auth\//.test(code)) {
          failures.push(`${p} imports @capexbe/auth — prefer @capex/auth-core for non-guard symbols`);
        }
        if (
          !/@capex\/auth-core/.test(code) &&
          !/@capexbe\/auth\/(guards|decorators)/.test(code) &&
          /app\.(module|controller)\.ts$/.test(p)
        ) {
          failures.push(`${p} should import auth from @capex/auth-core or @capexbe/auth/guards|decorators`);
        }
      }
    }
  };
  walk(srcDir);
}

if (failures.length) {
  console.error('Phase 3 auth-core verification FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('OK  @capex/auth-core — decorators + guards + AuthCoreModule in package (Phase 3d)');
console.log('    Auth services still bridge from capexbe until Phase 3e full compile');
