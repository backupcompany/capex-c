#!/usr/bin/env node
/** Share @nestjs packages with capexbe — avoids duplicate Reflector DI tokens. */
import { existsSync } from 'node:fs';
import { rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, '../../capexbe/node_modules/@nestjs');
const LINK = join(ROOT, 'node_modules/@nestjs');

if (!existsSync(TARGET)) {
  console.warn('WARN: capexbe/node_modules/@nestjs not found — run: cd capexbe && npm install');
  process.exit(0);
}

await rm(LINK, { recursive: true, force: true });
await symlink(TARGET, LINK);
console.log('OK  linked @nestjs → capexbe/node_modules/@nestjs');
