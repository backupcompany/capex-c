/**
 * Self-check: Capex Project List search tokens (AND) + code-like detection.
 * Run: node capexbe/src/project-list/project-list-search.selfcheck.mjs
 */
import assert from 'node:assert/strict';

function sanitizePostgrestSearchTerm(term) {
  return String(term ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 200);
}

function splitProjectListSearchTokens(search) {
  return sanitizePostgrestSearchTerm(search).split(/\s+/).filter(Boolean);
}

function isProjectListCodeLikeSearchToken(token) {
  const t = token.trim();
  if (!t) return false;
  if (t.includes('.') || t.includes(',')) return true;
  return /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+){2,}$/.test(t);
}

/** AND intersection of id sets per token (mirrors resolveSearchMatchingAssetIdsForQuery). */
function intersectTokenHits(tokenHitLists) {
  if (tokenHitLists.length === 0) return [];
  let acc = new Set(tokenHitLists[0]);
  for (let i = 1; i < tokenHitLists.length; i++) {
    const next = new Set();
    for (const id of tokenHitLists[i]) {
      if (acc.has(id)) next.add(id);
    }
    acc = next;
    if (acc.size === 0) return [];
  }
  return [...acc];
}

assert.deepEqual(splitProjectListSearchTokens('  AIDO.26.00.001  '), ['AIDO.26.00.001']);
assert.deepEqual(splitProjectListSearchTokens('mcc AIDO.26.00.001'), [
  'mcc',
  'AIDO.26.00.001',
]);
assert.equal(isProjectListCodeLikeSearchToken('AIDO.26.00.001'), true);
assert.equal(isProjectListCodeLikeSearchToken('AIDO.26.00,001'), true);
assert.equal(isProjectListCodeLikeSearchToken('mcc'), false);
assert.equal(isProjectListCodeLikeSearchToken('AIDO'), false);

function normalizeProjectListAssetCodeKey(code) {
  return String(code ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s.,_-]+/g, '');
}
assert.equal(
  normalizeProjectListAssetCodeKey('AIDO.26.00,001'),
  normalizeProjectListAssetCodeKey('AIDO.26.00.001'),
);

// Capex asset ids contain dots — must not be stripped before .in('id', …)
const SAFE_POSTGREST_ID = /^[A-Za-z0-9._-]{1,64}$/;
assert.equal(SAFE_POSTGREST_ID.test('ASSET-AIDO.26.RA-1781574949102-35eez'), true);
assert.equal(SAFE_POSTGREST_ID.test('bad;drop'), false);

// Exact code token alone → only that asset id (no sibling expand in this model).
assert.deepEqual(intersectTokenHits([['asset-aido']]), ['asset-aido']);

// mcc (many) AND code (one) → single
assert.deepEqual(
  intersectTokenHits([
    ['asset-aido', 'asset-other', 'asset-x'],
    ['asset-aido'],
  ]),
  ['asset-aido'],
);

// AND with no overlap → empty
assert.deepEqual(intersectTokenHits([['a', 'b'], ['c']]), []);

console.log('PASS project-list-search selfcheck');
