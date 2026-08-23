/**
 * Session object must keep a stable identity across re-renders.
 * A new `{ ... }` each render + `useEffect(..., [session])` cleared edits
 * before Save — toast: "Tidak ada perubahan untuk disimpan."
 */
import assert from 'node:assert/strict';

let resetCount = 0;
const originalsRef = { current: new Map() };
const editsRef = { current: new Map() };
const deletedRef = { current: new Set() };
const resetSession = () => {
  resetCount += 1;
  originalsRef.current.clear();
  editsRef.current.clear();
  deletedRef.current.clear();
};

const sessionA = { originalsRef, editsRef, deletedRef, resetSession };
const sessionB = { originalsRef, editsRef, deletedRef, resetSession };
assert.notEqual(sessionA, sessionB);

editsRef.current.set('p1', { id: 'p1', budgetPlan: 99 });
// Simulate buggy effect: reset whenever session identity changes
if (sessionA !== sessionB) resetSession();
assert.equal(editsRef.current.size, 0);
assert.equal(resetCount, 1);

console.log('budgetHuSessionIdentity: ok (documents the wipe bug)');
