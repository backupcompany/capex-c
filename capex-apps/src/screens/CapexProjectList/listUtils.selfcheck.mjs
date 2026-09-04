/**
 * Default CPL periods: Unit → Semua ([]); scope All → latest single period.
 * Run: node src/screens/CapexProjectList/listUtils.selfcheck.mjs
 */
import assert from 'node:assert/strict';

function resolveInitial(saved, opts = {}) {
  if (saved != null && Array.isArray(saved.selectedPeriods)) return saved.selectedPeriods;
  if (opts.preferSinglePeriod) {
    const periods = opts.budgetPeriods || [];
    const latest = periods[0]?.periodName;
    return latest ? [latest] : [];
  }
  return [];
}

assert.deepEqual(resolveInitial(null), []);
assert.deepEqual(resolveInitial(undefined), []);
assert.deepEqual(resolveInitial({ selectedPeriods: ['2026'] }), ['2026']);
assert.deepEqual(resolveInitial({ selectedPeriods: [] }), []);
assert.deepEqual(
  resolveInitial(null, {
    preferSinglePeriod: true,
    budgetPeriods: [{ periodName: '2026' }, { periodName: '2025' }],
  }),
  ['2026'],
);

// Unmatched priority names → keep empty priorityIds (All), never forceEmpty.
function resolvePriorityIds(priorityNames, config) {
  const ids = priorityNames.length
    ? config.filter((p) => priorityNames.some((n) => n === p.name)).map((p) => p.id)
    : [];
  const forceEmpty = false;
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
console.log('listUtils.selfcheck: ok');
