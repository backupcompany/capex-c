#!/usr/bin/env node
/** Dev: nest build --watch + postbuild + restart node (resolves @capexbe/* via dist/capexbe symlink). */
import { spawn, execSync } from 'node:child_process';
import { watch, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'dist/src/main.js');
const NEST_CLI = join(ROOT, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');

let nodeProc = null;
let debounce = null;

function postbuild() {
  execSync('node scripts/postbuild.mjs', { cwd: ROOT, stdio: 'pipe' });
}

function startNode() {
  nodeProc?.kill('SIGTERM');
  nodeProc = spawn('node', ['-r', '@swc-node/register', '-r', 'tsconfig-paths/register', 'dist/src/main.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
}

function restart() {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (!existsSync(ENTRY)) return;
    try {
      postbuild();
      startNode();
    } catch {
      /* dist not ready */
    }
  }, 500);
}

const nest = spawn(process.execPath, [NEST_CLI, 'build', '--watch'], { cwd: ROOT, stdio: 'inherit' });

const wait = setInterval(() => {
  if (!existsSync(ENTRY)) return;
  clearInterval(wait);
  try {
    postbuild();
    startNode();
    watch(join(ROOT, 'dist/src'), { recursive: true }, restart);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}, 300);

nest.on('exit', (code) => process.exit(code ?? 1));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    clearInterval(wait);
    nodeProc?.kill(sig);
    nest.kill(sig);
    process.exit(0);
  });
}
