import { userCanAccessUnassignedBdd } from './bddRolePolicy';
import type { User } from '../types';

function userWithRoles(...roleNames: string[]): User {
  return {
    id: 1,
    username: 't',
    email: 't@x.com',
    assignments: roleNames.map((roleName) => ({ roleName, assignedScopes: ['All'] })),
  };
}

describe('userCanAccessUnassignedBdd', () => {
  it('allows Super Admin, PMO, BDD', () => {
    expect(userCanAccessUnassignedBdd(userWithRoles('PMO'))).toBe(true);
    expect(userCanAccessUnassignedBdd(userWithRoles('Super Admin'))).toBe(true);
    expect(userCanAccessUnassignedBdd(userWithRoles('BDD'))).toBe(true);
  });

  it('denies Viewer', () => {
    expect(userCanAccessUnassignedBdd(userWithRoles('Viewer'))).toBe(false);
  });
});
