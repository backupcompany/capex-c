import { isSuperAdminRole } from '../auth/auth.constants';
import {
  buildScopeResolutionMaps,
  resolveUserScopes,
  type ScopeResolutionMaps,
} from '../monitoring/scope-resolution';

export type { ScopeResolutionMaps };

export type UserAssignmentLike = {
  roleName?: string;
  assignedScopes?: string[];
};

export type AssetScopeLike = {
  huName?: string;
  archetypeName?: string;
};

const norm = (id: string | number | undefined) => (id == null ? '' : String(id));

function assignmentHasAllScope(scopes: string[] | undefined): boolean {
  return (scopes ?? []).some((s) => String(s).trim().toLowerCase() === 'all');
}

export function userIsSuperAdmin(assignments: UserAssignmentLike[] | undefined): boolean {
  return (assignments ?? []).some((a) => isSuperAdminRole(a.roleName));
}

/** Super Admin or assignment scope "All" — may view every task in My Task (not only own role steps). */
export function userCanViewAllTasks(assignments: UserAssignmentLike[] | undefined): boolean {
  if (userIsSuperAdmin(assignments)) return true;
  return (assignments ?? []).some((a) => assignmentHasAllScope(a.assignedScopes));
}

/** Union of all assignment scopes — for ad-hoc tasks and display belt checks. */
export function isAssetInUserUnionScope(
  asset: AssetScopeLike,
  assignments: UserAssignmentLike[] | undefined,
  maps: ScopeResolutionMaps,
): boolean {
  if (userIsSuperAdmin(assignments)) return true;
  if ((assignments ?? []).some((a) => assignmentHasAllScope(a.assignedScopes))) return true;

  const union = resolveUserScopes(assignments, maps);
  if (!asset.huName && !asset.archetypeName) return false;
  return (
    (asset.huName != null && union.unitNames.has(asset.huName)) ||
    (asset.archetypeName != null && union.archetypeNames.has(asset.archetypeName))
  );
}

/**
 * Workflow task is actionable when a user assignment matches BOTH the step role
 * and the asset hospital unit / archetype scope for that assignment.
 */
export function isWorkflowStepAssignedToUser(
  stepRoleIds: Array<string | number>,
  assignments: UserAssignmentLike[] | undefined,
  allRoles: Array<{ id: string | number; roleName?: string }>,
  asset: AssetScopeLike,
  maps: ScopeResolutionMaps,
): boolean {
  if (userCanViewAllTasks(assignments)) return true;

  const stepRoleSet = new Set(stepRoleIds.map(norm));

  for (const assignment of assignments ?? []) {
    const role = allRoles.find((r) => r.roleName === assignment.roleName);
    if (!role || !stepRoleSet.has(norm(role.id))) continue;

    if (isSuperAdminRole(assignment.roleName) || assignmentHasAllScope(assignment.assignedScopes)) {
      return true;
    }

    const resolved = resolveUserScopes([assignment], maps);
    const inUnit = asset.huName != null && resolved.unitNames.has(asset.huName);
    const inArch = asset.archetypeName != null && resolved.archetypeNames.has(asset.archetypeName);
    if (inUnit || inArch) return true;
  }

  return false;
}

/**
 * "My tasks only" — ignores Super Admin / scope-All bypass.
 * Broad assignments do not claim every open workflow step.
 */
export function isWorkflowStepMineForUser(
  stepRoleIds: Array<string | number>,
  assignments: UserAssignmentLike[] | undefined,
  allRoles: Array<{ id: string | number; roleName?: string }>,
  asset: AssetScopeLike,
  maps: ScopeResolutionMaps,
): boolean {
  const stepRoleSet = new Set(stepRoleIds.map(norm));

  for (const assignment of assignments ?? []) {
    if (isSuperAdminRole(assignment.roleName) || assignmentHasAllScope(assignment.assignedScopes)) {
      continue;
    }
    const role = allRoles.find((r) => r.roleName === assignment.roleName);
    if (!role || !stepRoleSet.has(norm(role.id))) continue;

    const resolved = resolveUserScopes([assignment], maps);
    const inUnit = asset.huName != null && resolved.unitNames.has(asset.huName);
    const inArch = asset.archetypeName != null && resolved.archetypeNames.has(asset.archetypeName);
    if (inUnit || inArch) return true;
  }

  return false;
}

export type BuiltTaskMineInput = {
  type: 'workflow' | 'adhoc';
  workflowStep?: { roleIds?: Array<string | number> };
  adhocTask?: { assignedToUserId?: number };
  completedByUserId?: number | null;
  huName?: string;
  archetypeName?: string;
};

/** Whether a built task belongs to the viewer (not org-wide view-all). */
export function isBuiltTaskMineForUser(
  userId: number,
  userAssignments: UserAssignmentLike[] | undefined,
  allRoles: Array<{ id: string | number; roleName?: string }>,
  scopeMaps: ScopeResolutionMaps,
  task: BuiltTaskMineInput,
): boolean {
  if (task.type === 'adhoc') {
    return Number(task.adhocTask?.assignedToUserId) === Number(userId);
  }
  if (task.completedByUserId != null && Number(task.completedByUserId) === Number(userId)) {
    return true;
  }
  const stepRoleIds = task.workflowStep?.roleIds ?? [];
  if (!stepRoleIds.length) return false;
  return isWorkflowStepMineForUser(
    stepRoleIds,
    userAssignments,
    allRoles,
    { huName: task.huName, archetypeName: task.archetypeName },
    scopeMaps,
  );
}

export function filterBuiltTasksToMineOnly<T extends BuiltTaskMineInput>(
  tasks: T[],
  userId: number,
  userAssignments: UserAssignmentLike[] | undefined,
  allRoles: Array<{ id: string | number; roleName?: string }>,
  scopeMaps: ScopeResolutionMaps,
): T[] {
  return tasks.filter((task) =>
    isBuiltTaskMineForUser(userId, userAssignments, allRoles, scopeMaps, task),
  );
}

export { buildScopeResolutionMaps };
