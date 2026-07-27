#!/usr/bin/env node
/** Post-build: symlink capexbe + fix require paths for dist/src/*.js */
import { readdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(ROOT, 'dist');
const DIST_SRC = join(DIST, 'src');

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

for (const file of await walk(DIST_SRC)) {
  let code = await readFile(file, 'utf8');
  const next = code.replaceAll('../../../capexbe/', '../capexbe/');
  if (next !== code) await writeFile(file, next);
}

const linkPath = join(DIST, 'capexbe');
try {
  await symlink(join(ROOT, '../../capexbe'), linkPath);
} catch (e) {
  if (!(e && typeof e === 'object' && 'code' in e && e.code === 'EEXIST')) throw e;
}

console.log('OK  postbuild: dist capexbe symlink + paths');
