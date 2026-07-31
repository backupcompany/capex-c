#!/usr/bin/env node
/** Share @nestjs packages with capexbe — avoids duplicate Reflector DI tokens. */
import { existsSync } from 'node:fs';
import { mkdir, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BE_NEST = join(ROOT, '../../capexbe/node_modules/@nestjs');
const LOCAL_NEST = join(ROOT, 'node_modules/@nestjs');

const PACKAGES = ['common', 'core', 'platform-express', 'throttler'];

if (!existsSync(BE_NEST)) {
  console.warn('WARN: capexbe/node_modules/@nestjs not found — run: cd capexbe && npm install');
  process.exit(0);
}

await mkdir(LOCAL_NEST, { recursive: true });

for (const pkg of PACKAGES) {
  const target = join(BE_NEST, pkg);
  const link = join(LOCAL_NEST, pkg);
  if (!existsSync(target)) {
    console.warn(`WARN skip @nestjs/${pkg} — not found in capexbe`);
    continue;
  }
  await rm(link, { recursive: true, force: true });
  await symlink(target, link);
}

console.log('OK  linked @nestjs/{common,core,...} → capexbe (Reflector DI shared)');
