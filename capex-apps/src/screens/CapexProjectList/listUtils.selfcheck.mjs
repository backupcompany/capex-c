/**
 * Default CPL periods = Semua ([]); unmatched priorities must not blank the list.
 * Run: node src/screens/CapexProjectList/listUtils.selfcheck.mjs
 */
import assert from 'node:assert/strict';

function resolveInitial(saved) {
  if (saved != null && Array.isArray(saved.selectedPeriods)) return saved.selectedPeriods;
  return [];
}

assert.deepEqual(resolveInitial(null), []);
assert.deepEqual(resolveInitial(undefined), []);
assert.deepEqual(resolveInitial({ selectedPeriods: ['2026'] }), ['2026']);
assert.deepEqual(resolveInitial({ selectedPeriods: [] }), []);

// Unmatched priority names → keep empty priorityIds (All), never forceEmpty.
function resolvePriorityIds(priorityNames, config) {
  const ids = priorityNames.length
    ? config.filter((p) => priorityNames.some((n) => n === p.name)).map((p) => p.id)
    : [];
  const forceEmpty = false; // was: priorityNames.length > 0 && ids.length === 0
  return { ids, forceEmpty };
}

assert.deepEqual(resolvePriorityIds([], [{ id: '1', name: 'High' }]), {
  ids: [],
  forceEmpty: false,
});
assert.deepEqual(resolvePriorityIds(['Stale'], [{ id: '1', name: 'High' }]), {
  ids: [],
  forceEmpty: false,
});
assert.deepEqual(resolvePriorityIds(['High'], [{ id: '1', name: 'High' }]), {
  ids: ['1'],
  forceEmpty: false,
});

console.log('listUtils.selfcheck: ok');
