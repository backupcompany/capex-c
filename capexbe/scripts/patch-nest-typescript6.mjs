#!/usr/bin/env node
/**
 * Nest CLI reads tsconfig via the TypeScript programmatic API.
 * TS 7 (Go) no longer exposes that API on the main `typescript` package.
 * When typescript@7+ is installed, point Nest at @typescript/typescript6 instead.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOADER = join(ROOT, 'node_modules/@nestjs/cli/lib/compiler/typescript-loader.js');
const MARKER = 'typescript6-shim-for-ts7';

if (!existsSync(LOADER)) {
  process.exit(0);
}

const src = readFileSync(LOADER, 'utf8');
if (src.includes(MARKER)) {
  process.exit(0);
}

const needle = `            const tsBinaryPath = require.resolve('typescript', {
                paths: [process.cwd(), ...this.getModulePaths()],
            });
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const tsBinary = require(tsBinaryPath);`;

const replacement = `            // ${MARKER}
            let tsBinaryPath;
            try {
                const tsPkg = require(require.resolve('typescript/package.json', {
                    paths: [process.cwd(), ...this.getModulePaths()],
                }));
                if (String(tsPkg.version || '').startsWith('7.')) {
                    tsBinaryPath = require.resolve('@typescript/typescript6', {
                        paths: [process.cwd(), ...this.getModulePaths()],
                    });
                }
            }
            catch {
                /* use default typescript */
            }
            if (!tsBinaryPath) {
                tsBinaryPath = require.resolve('typescript', {
                    paths: [process.cwd(), ...this.getModulePaths()],
                });
            }
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const tsBinary = require(tsBinaryPath);`;

if (!src.includes(needle)) {
  console.warn('[patch-nest-typescript6] nest typescript-loader shape changed — skip');
  process.exit(0);
}

writeFileSync(LOADER, src.replace(needle, replacement));
console.log('[patch-nest-typescript6] Nest CLI will use @typescript/typescript6 with typescript@7');
