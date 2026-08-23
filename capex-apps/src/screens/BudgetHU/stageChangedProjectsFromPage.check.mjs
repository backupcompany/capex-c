import assert from 'node:assert/strict';

/** Mirrors stageChangedProjectsFromPage — one cell edit must not stage the whole page. */
function projectFieldsChanged(prev, next) {
  return (
    prev.projectName !== next.projectName ||
    prev.budgetPlan !== next.budgetPlan ||
    prev.budgetCarryForward !== next.budgetCarryForward ||
    prev.approvedBudget !== next.approvedBudget
  );
}

function stageChangedProjectsFromPage(pageData, originals, edits) {
  let staged = 0;
  for (const project of pageData) {
    const original = originals.get(project.id);
    if (!original) {
      edits.set(project.id, project);
      staged += 1;
      continue;
    }
    if (!projectFieldsChanged(original, project)) {
      edits.delete(project.id);
      continue;
    }
    edits.set(project.id, project);
    staged += 1;
  }
  return staged;
}

const originals = new Map([
  ['a', { id: 'a', projectName: 'A', budgetPlan: 100, budgetCarryForward: 0, approvedBudget: 0 }],
  ['b', { id: 'b', projectName: 'B', budgetPlan: 200, budgetCarryForward: 0, approvedBudget: 0 }],
  ['c', { id: 'c', projectName: 'C', budgetPlan: 300, budgetCarryForward: 0, approvedBudget: 0 }],
]);
const edits = new Map();
const page = [
  { id: 'a', projectName: 'A', budgetPlan: 100, budgetCarryForward: 0, approvedBudget: 0 },
  { id: 'b', projectName: 'B', budgetPlan: 999, budgetCarryForward: 0, approvedBudget: 0 }, // only this changed
  { id: 'c', projectName: 'C', budgetPlan: 300, budgetCarryForward: 0, approvedBudget: 0 },
];

assert.equal(stageChangedProjectsFromPage(page, originals, edits), 1);
assert.equal(edits.size, 1);
assert.equal(edits.get('b').budgetPlan, 999);
console.log('stageChangedProjectsFromPage: ok');
