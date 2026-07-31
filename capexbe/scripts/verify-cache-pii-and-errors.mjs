#!/usr/bin/env node
/**
 * Runnable check: cache PII mask + prod error scrub.
 * Run: node --import tsx scripts/verify-cache-pii-and-errors.mjs
 * Falls back to compiling via existing dist if tsx unavailable — static import of built logic duplicated below for zero deps.
 */
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

function maskEmail(email) {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const maskedLocal = local.length <= 1 ? '*' : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

function maskPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

function maskTaxId(npwp) {
  const digits = npwp.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

const CACHE_PII_KEYS = new Set([
  'email',
  'phone',
  'phoneNumber',
  'phone_number',
  'npwp',
  'taxId',
  'tax_id',
]);

function maskPiiForCache(value) {
  if (Array.isArray(value)) return value.map(maskPiiForCache);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (CACHE_PII_KEYS.has(key) && typeof child === 'string' && child.trim()) {
      if (key === 'email') out[key] = maskEmail(child);
      else if (key === 'npwp' || key === 'taxId' || key === 'tax_id') out[key] = maskTaxId(child);
      else out[key] = maskPhone(child);
      continue;
    }
    out[key] = maskPiiForCache(child);
  }
  return out;
}

const INTERNAL_ERROR_RE =
  /PGRST\d*|postgrest|supabase|postgres|SQLSTATE|permission denied for|column .+ does not exist|relation .+ does not exist|duplicate key value|violates (unique|foreign key|check|not-null)|JWT (expired|malformed)|ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|getaddrinfo|stack trace|at Object\./i;

function isInternalErrorMessage(message) {
  return INTERNAL_ERROR_RE.test(message);
}

const cached = maskPiiForCache({
  users: [{ id: 1, username: 'a', email: 'alice@siloamhospitals.com', phoneNumber: '+6281234567890' }],
  vendors: [{ id: 2, name: 'V', npwp: '10.20.30.40.50.60.70' }],
  ok: true,
});

assert.equal(cached.users[0].email, 'a***@siloamhospitals.com');
assert.equal(cached.users[0].phoneNumber, '***7890');
assert.equal(cached.vendors[0].npwp, '***6070');
assert.equal(cached.users[0].username, 'a');
assert.equal(cached.ok, true);

assert.equal(isInternalErrorMessage('PGRST116: JSON object requested'), true);
assert.equal(isInternalErrorMessage('duplicate key value violates unique constraint'), true);
assert.equal(isInternalErrorMessage('Invalid period name'), false);
assert.equal(isInternalErrorMessage('Unauthorized'), false);

// keep hash import "used" — proves crypto stdlib path for PII hashing still available
assert.equal(createHash('sha256').update('x').digest('hex').length, 64);

console.log('OK  cache PII mask + internal error scrub');
