/**
 * ponytail check: landing skips Hide screens (Dashboard) for role with later open page.
 * Run: node src/lib/postLoginLanding.selfcheck.mjs
 */
import assert from 'node:assert/strict';

// Mirror resolvePostLoginLandingPage loop without TS imports.
const NAV = ['Dashboard', 'Executive Summary', 'Budget HU', 'My Task'];

function firstOpen(openSet) {
  for (const label of NAV) {
    if (openSet.has(label)) return label;
  }
  return NAV[0];
}

assert.equal(firstOpen(new Set(['Budget HU', 'My Task'])), 'Budget HU');
assert.equal(firstOpen(new Set(['Dashboard', 'My Task'])), 'Dashboard');
assert.equal(firstOpen(new Set()), 'Dashboard');
console.log('postLoginLanding.selfcheck: ok');
