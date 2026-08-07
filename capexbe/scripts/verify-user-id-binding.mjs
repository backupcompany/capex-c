#!/usr/bin/env node
/**
 * IDOR guardrails:
 * - Global JwtAuthGuard binds access token → userId (assertUserIdMatch on body.userId/publicUserId).
 * - Controllers should use getCallerUserId(req), not Number(body.userId).
 *
 * Run: node scripts/verify-user-id-binding.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const SKIP = new Set(['auth.controller.ts', 'app.controller.ts']);

function walkControllers(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walkControllers(path, out);
    else if (name.endsWith('.controller.ts')) out.push(path);
  }
  return out;
}

const failures = [];
const warnings = [];

for (const file of walkControllers(ROOT)) {
  const base = file.split('/').pop();
  if (SKIP.has(base)) continue;
  const text = readFileSync(file, 'utf8');
  if (!text.includes('@Post(') && !text.includes('@Get(')) continue;

  const usesBodyUserId = /Number\(body\?\.userId\)|parseUserId\(body\)|body\.userId/.test(text);
  const usesCaller = text.includes('getCallerUserId(');

  if (usesBodyUserId && !usesCaller) {
    warnings.push(`${base}: reads body.userId — prefer getCallerUserId(req) after JwtAuthGuard`);
  }
}

const guardFile = join(ROOT, 'auth/guards/jwt-auth.guard.ts');
const guardText = readFileSync(guardFile, 'utf8');
if (!guardText.includes('parseBodyUserId(req)')) {
  failures.push('jwt-auth.guard.ts must call authContext.resolve(token, parseBodyUserId(req))');
}
const parseBodyText = readFileSync(join(ROOT, 'auth/request-access-token.util.ts'), 'utf8');
if (/body\?\.userId/.test(parseBodyText)) {
  failures.push('parseBodyUserId must not accept raw body.userId — use publicUserId only');
}
if (!readFileSync(join(ROOT, 'auth/auth-user.resolver.ts'), 'utf8').includes('assertUserIdMatch')) {
  failures.push('auth-user.resolver.ts must enforce assertUserIdMatch');
}

if (failures.length) {
  console.error('User ID binding verification FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

if (warnings.length) {
  console.warn('User ID binding warnings (migrate to getCallerUserId):\n' + warnings.map((w) => `  - ${w}`).join('\n'));
}

console.log('OK  user id binding — JwtAuthGuard + assertUserIdMatch active');
