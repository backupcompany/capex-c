#!/usr/bin/env node
/** Start all leaf services + monolith in dev (background). Usage: make run-all-leaf */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const SERVICES = [
  { dir: 'capexbe', cmd: 'npm', args: ['run', 'start:dev'], port: 3001 },
  { dir: 'services/capex-notifications', port: 3002 },
  { dir: 'services/capex-audit', port: 3003 },
  { dir: 'services/capex-backup', port: 3004 },
  { dir: 'services/capex-config', port: 3005 },
  { dir: 'services/capex-mom-daily-summary', port: 3006 },
  { dir: 'services/capex-asset-timeline', port: 3007 },
  { dir: 'services/capex-duplicate-detection', port: 3008 },
  { dir: 'services/capex-user-admin', port: 3009 },
  { dir: 'services/capex-procurement', port: 3010 },
  { dir: 'services/capex-fs', port: 3011 },
  { dir: 'services/capex-monitoring', port: 3012 },
  { dir: 'services/capex-reporting', port: 3013 },
  { dir: 'services/capex-executive-summary', port: 3014 },
  { dir: 'services/capex-tasks', port: 3015 },
  { dir: 'services/capex-core', port: 3016 },
  { dir: 'services/capex-smart-migration', port: 3017 },
  { dir: 'services/capex-auth', port: 3018 },
];

if (!existsSync(join(ROOT, 'capexbe/.env'))) {
  console.error('Missing capexbe/.env — run: make env');
  process.exit(1);
}

const needSync = SERVICES.some(
  (s) => s.dir !== 'capexbe' && !existsSync(join(ROOT, s.dir, '.env')),
);
if (needSync) {
  console.log('Syncing leaf .env from capexbe/.env …');
  spawnSync('node', ['scripts/microservices/sync-leaf-env.mjs'], { cwd: ROOT, stdio: 'inherit' });
}

const children = [];

for (const svc of SERVICES) {
  const cwd = join(ROOT, svc.dir);
  if (!existsSync(join(cwd, '.env')) && svc.dir !== 'capexbe') {
    console.warn(`SKIP ${svc.dir} — missing .env`);
    continue;
  }
  const linkScript = join(cwd, 'scripts/link-nest-deps.mjs');
  if (svc.dir !== 'capexbe' && existsSync(linkScript)) {
    spawnSync('node', [linkScript], { cwd, stdio: 'ignore' });
  }
  const args = svc.args ?? ['run', 'start:prod'];
  const cmd = svc.cmd ?? 'npm';
  const child = spawn(cmd, args, { cwd, stdio: 'ignore', detached: true });
  child.unref();
  children.push({ dir: svc.dir, port: svc.port, pid: child.pid });
  console.log(`START ${svc.dir} :${svc.port} pid=${child.pid}`);
}

console.log('\n18 services starting — wait ~30s then: make compose-verify');
console.log('Stop all: make stop');
