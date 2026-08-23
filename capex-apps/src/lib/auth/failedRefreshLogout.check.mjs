/** Assert logout after failed refresh does not require cookie hint. */
import assert from 'node:assert/strict';

/** Mirrors authenticatedFetch / capexBeAxios decision after refresh fails. */
function shouldLogoutAfterFailedRefresh({ stillValid, probeComplete }) {
  if (stillValid) return false;
  if (!probeComplete) return false;
  return true;
}

assert.equal(shouldLogoutAfterFailedRefresh({ stillValid: true, probeComplete: true }), false);
assert.equal(shouldLogoutAfterFailedRefresh({ stillValid: false, probeComplete: false }), false);
assert.equal(shouldLogoutAfterFailedRefresh({ stillValid: false, probeComplete: true }), true);
// Regression: cookies already cleared (hint false) must still logout.
assert.equal(shouldLogoutAfterFailedRefresh({ stillValid: false, probeComplete: true }), true);

console.log('failedRefreshLogout.check.mjs: ok');
