#!/usr/bin/env node
/**
 * Build all (or canary) leaf NestJS services — compile check without running stack.
 * Usage:
 *   make build-all-leaf           # all 17
 *   make verify-leaf-build        # canary 3 (CI-safe, faster)
 */
import { existsSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BE_NODE = join(ROOT, 'capexbe/node_modules');

const ALL_LEAVES = [
  'capex-notifications',
  'capex-audit',
  'capex-backup',
  'capex-config',
  'capex-mom-daily-summary',
  'capex-asset-timeline',
  'capex-duplicate-detection',
  'capex-user-admin',
  'capex-procurement',
  'capex-fs',
  'capex-monitoring',
  'capex-reporting',
  'capex-executive-summary',
  'capex-tasks',
  'capex-core',
  'capex-smart-migration',
  'capex-auth',
];

const CANARY = ['capex-notifications', 'capex-core', 'capex-auth'];

const canaryOnly = process.argv.includes('--canary');
const leaves = canaryOnly ? CANARY : ALL_LEAVES;
const failures = [];

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

console.log(`=== CAPEX leaf build ${canaryOnly ? '(canary ×3)' : '(all ×17)'} ===\n`);

if (!existsSync(BE_NODE)) {
  console.error('Missing capexbe/node_modules — run: cd capexbe && npm ci');
  process.exit(1);
}

for (const leaf of leaves) {
  const dir = join(ROOT, 'services', leaf);
  if (!existsSync(join(dir, 'package.json'))) {
    failures.push(`${leaf}: package.json missing`);
    continue;
  }

  if (!existsSync(join(dir, 'node_modules'))) {
    const ins = run('npm', ['install', '--ignore-scripts'], dir);
    if (!ins.ok) {
      failures.push(`${leaf}: npm install failed — ${ins.out.slice(-200)}`);
      continue;
    }
    run('node', ['scripts/link-nest-deps.mjs'], dir);
  }

  const nestBin = join(dir, 'node_modules/.bin/nest');
  if (existsSync(nestBin)) {
    try {
      chmodSync(nestBin, 0o755);
    } catch {
      /* ignore */
    }
  }

  const build = run('npm', ['run', 'build'], dir);
  if (!build.ok) {
    failures.push(`${leaf}: build failed — ${build.out.slice(-400)}`);
    console.error(`FAIL ${leaf}`);
  } else {
    console.log(`OK  ${leaf}`);
  }
}

if (failures.length) {
  console.error('\nLeaf build FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`\nLeaf build PASSED (${leaves.length} services)`);
