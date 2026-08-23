import { assignmentRolesCanSeeUnassignedBdd } from './bdd-construction.util';

describe('assignmentRolesCanSeeUnassignedBdd', () => {
  it('allows Super Admin, PMO, BDD', () => {
    expect(assignmentRolesCanSeeUnassignedBdd(['Super Admin'])).toBe(true);
    expect(assignmentRolesCanSeeUnassignedBdd(['PMO'])).toBe(true);
    expect(assignmentRolesCanSeeUnassignedBdd(['BDD'])).toBe(true);
    expect(assignmentRolesCanSeeUnassignedBdd(['pmo'])).toBe(true);
  });

  it('denies Viewer and empty', () => {
    expect(assignmentRolesCanSeeUnassignedBdd(['Viewer'])).toBe(false);
    expect(assignmentRolesCanSeeUnassignedBdd([])).toBe(false);
  });
});
