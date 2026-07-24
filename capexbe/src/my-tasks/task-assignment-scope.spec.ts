import {
  isBuiltTaskMineForUser,
  isWorkflowStepAssignedToUser,
  userCanViewAllTasks,
} from './task-assignment-scope';
import type { ScopeResolutionMaps } from '../monitoring/scope-resolution';

const maps: ScopeResolutionMaps = {
  archetypeIdToName: new Map([['ARCH-01', 'Premium Specialist']]),
  huIdToName: new Map([['HU-01', 'RS Siloam A']]),
  huIdToArchetypeName: new Map([['HU-01', 'Premium Specialist']]),
  huNameToArchetypeName: new Map([['RS Siloam A', 'Premium Specialist']]),
  archetypeNameSet: new Set(['Premium Specialist']),
  huNameSet: new Set(['RS Siloam A']),
  allArchetypeNames: ['Premium Specialist'],
  allHuNames: ['RS Siloam A'],
};

const allRoles = [
  { id: 1, roleName: 'Super Admin' },
  { id: 2, roleName: 'BDD' },
];

describe('task-assignment-scope', () => {
  it('userCanViewAllTasks is true for Super Admin', () => {
    expect(
      userCanViewAllTasks([{ roleName: 'Super Admin', assignedScopes: ['All'] }]),
    ).toBe(true);
  });

  it('isWorkflowStepAssignedToUser returns true for Super Admin on any step', () => {
    expect(
      isWorkflowStepAssignedToUser(
        [99],
        [{ roleName: 'Super Admin', assignedScopes: ['All'] }],
        allRoles,
        { huName: 'RS Siloam A', archetypeName: 'Premium Specialist' },
        maps,
      ),
    ).toBe(true);
  });

  it('isBuiltTaskMineForUser is false for Super Admin on unrelated open workflow', () => {
    expect(
      isBuiltTaskMineForUser(
        148,
        [{ roleName: 'Super Admin', assignedScopes: ['All'] }],
        allRoles,
        maps,
        {
          type: 'workflow',
          workflowStep: { roleIds: [2] },
          huName: 'RS Siloam A',
          archetypeName: 'Premium Specialist',
        },
      ),
    ).toBe(false);
  });

  it('isBuiltTaskMineForUser is true for adhoc assigned to user', () => {
    expect(
      isBuiltTaskMineForUser(
        148,
        [{ roleName: 'Super Admin', assignedScopes: ['All'] }],
        allRoles,
        maps,
        {
          type: 'adhoc',
          adhocTask: { assignedToUserId: 148 },
        },
      ),
    ).toBe(true);
  });

  it('isBuiltTaskMineForUser is true when user completed workflow task', () => {
    expect(
      isBuiltTaskMineForUser(
        148,
        [{ roleName: 'Super Admin', assignedScopes: ['All'] }],
        allRoles,
        maps,
        {
          type: 'workflow',
          workflowStep: { roleIds: [99] },
          completedByUserId: 148,
          huName: 'RS Siloam A',
        },
      ),
    ).toBe(true);
  });

  it('isBuiltTaskMineForUser is true for scoped BDD assignment', () => {
    expect(
      isBuiltTaskMineForUser(
        50,
        [{ roleName: 'BDD', assignedScopes: ['HU-01'] }],
        allRoles,
        maps,
        {
          type: 'workflow',
          workflowStep: { roleIds: [2] },
          huName: 'RS Siloam A',
          archetypeName: 'Premium Specialist',
        },
      ),
    ).toBe(true);
  });
});
