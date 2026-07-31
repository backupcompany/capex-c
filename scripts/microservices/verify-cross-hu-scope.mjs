#!/usr/bin/env node
/**
 * Phase 11.9 — cross-HU scope unit tests (no running services).
 * Usage: make verify-cross-hu-scope
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const spec = 'src/project-list/cross-hu-scope.spec.ts';

const result = spawnSync(
  'npx',
  ['jest', spec, '--runInBand', '--forceExit'],
  { cwd: join(ROOT, 'capexbe'), stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('OK  cross-HU scope — project-list assignment intersection tests passed');
