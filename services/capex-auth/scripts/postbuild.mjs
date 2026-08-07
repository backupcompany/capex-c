#!/usr/bin/env node
/** Post-build: symlink capexbe + auth-core + fix require paths for dist/src/*.js */
import { readdir, readFile, writeFile, symlink, mkdir } from 'node:fs/promises';
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
  let next = code.replaceAll('../../../capexbe/', '../capexbe/');
  next = next.replaceAll('../../../packages/capex-auth-core/', '../packages/capex-auth-core/');
  // Keep capexbe imports on src/*.ts — @swc-node/register resolves them; dist/*.js breaks DI tokens.
  next = next.replaceAll('../capexbe/dist/src/', '../capexbe/src/');
  // preload must stay on compiled dist — never symlink preload.js into capexbe/src (nest --watch loops)
  next = next.replaceAll('../capexbe/src/shared/preload', '../capexbe/dist/src/shared/preload');
  if (next !== code) await writeFile(file, next);
}

async function link(from, to) {
  try {
    await symlink(from, to);
  } catch (e) {
    if (!(e && typeof e === 'object' && 'code' in e && e.code === 'EEXIST')) throw e;
  }
}

await link(join(ROOT, '../../capexbe'), join(DIST, 'capexbe'));
await mkdir(join(DIST, 'packages'), { recursive: true });
await link(join(ROOT, '../../packages/capex-auth-core'), join(DIST, 'packages/capex-auth-core'));

console.log('OK  postbuild: dist symlinks (capexbe + @capex/auth-core) + paths');
