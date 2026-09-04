import type { User, UserAssignment, UserRole } from '../../types';
import { readCachedAuthUser } from '../authSessionCache';
import { formatUserPublicId } from '../publicUserId';
import {
  findRoleForAssignment,
  isUserSuperAdmin,
  normalizeRoleNameKey,
} from '../userRoleResolution';

export type AuthSessionAssignment = {
  roleName: string;
  roleId?: number;
  assignedScopes?: string[];
};

/** Tampilkan slug enterprise sebagai label singkat (super_admin → Super Admin). */
export function humanizeRoleSlug(slug: string): string {
  const n = normalizeRoleNameKey(slug);
  if (n === 'superadmin' || n === 'superadministrator') return 'Super Admin';
  return String(slug ?? '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function mapSessionAssignmentsToUserAssignments(
  assignments?: AuthSessionAssignment[] | null,
  roleSlugs?: string[] | null,
): UserAssignment[] {
  if (assignments?.length) {
    return assignments
      .filter((a) => String(a.roleName ?? '').trim())
      .map((a) => ({
        roleName: String(a.roleName).trim(),
        ...(a.roleId != null && Number.isFinite(a.roleId) ? { roleId: a.roleId } : {}),
        assignedScopes: Array.isArray(a.assignedScopes) ? a.assignedScopes : [],
      }));
  }
  if (roleSlugs?.length) {
    return roleSlugs
      .filter((r) => String(r ?? '').trim())
      .map((slug) => ({
        roleName: humanizeRoleSlug(slug),
        assignedScopes: [] as string[],
      }));
  }
  return [];
}

function assignmentScopeCount(assignments: UserAssignment[]): number {
  return assignments.reduce((n, a) => n + (a.assignedScopes?.length ?? 0), 0);
}

/**
 * Bangun User dari identitas session/login tanpa menghapus assignments cache
 * (atau assignments dari response auth) — mencegah flicker "No Role".
 */
export function mergeAuthIdentityUser(
  identity: { id?: number; publicId?: string; username: string; email: string },
  options?: {
    sessionAssignments?: AuthSessionAssignment[] | null;
    roleSlugs?: string[] | null;
    previous?: User | null;
  },
): User {
  const cached = readCachedAuthUser();
  const previousCandidate = options?.previous ?? null;
  const previous =
    previousCandidate &&
    (previousCandidate.publicId === identity.publicId || previousCandidate.id === identity.id)
      ? previousCandidate
      : cached?.publicId === identity.publicId || cached?.id === identity.id
        ? cached
        : null;

  const fromSession = mapSessionAssignmentsToUserAssignments(
    options?.sessionAssignments,
    options?.roleSlugs,
  );
  const previousAssignments = previous?.assignments ?? [];

  // Session assignments are authoritative for *which role*. Never keep a cached
  // PMO (many HU scopes) over a fresh Super Admin (scope "All" = 1 entry).
  let assignments = fromSession;
  if (!fromSession.length && previousAssignments.length) {
    assignments = previousAssignments;
  } else if (fromSession.length && previousAssignments.length) {
    const sessionRoles = fromSession
      .map((a) => normalizeRoleNameKey(a.roleName))
      .sort()
      .join(',');
    const prevRoles = previousAssignments
      .map((a) => normalizeRoleNameKey(a.roleName))
      .sort()
      .join(',');
    if (
      sessionRoles === prevRoles &&
      assignmentScopeCount(previousAssignments) > assignmentScopeCount(fromSession)
    ) {
      assignments = previousAssignments;
    }
  }

  const resolvedId =
    (identity.id != null && Number.isFinite(identity.id) ? identity.id : null) ??
    previous?.id ??
    (cached?.id != null && cached.publicId === identity.publicId ? cached.id : null);

  if (resolvedId == null || !Number.isFinite(resolvedId)) {
    throw new Error('Invalid session identity: missing id (server must return id for self)');
  }

  return {
    id: resolvedId,
    publicId: identity.publicId ?? previous?.publicId ?? formatUserPublicId(),
    username: identity.username,
    email: identity.email,
    phoneNumber: previous?.phoneNumber,
    assignments,
  };
}

/**
 * True jika sidebar / page guard boleh mengevaluasi akses (bukan loading).
 * Sebelum siap: tampilkan loading, bukan Access Denied / menu kosong sebagai deny.
 */
export function areShellPermissionsReady(
  currentUser: User | null,
  allRoles: UserRole[],
  options: { dataInitialized: boolean; bootstrapFailed?: boolean },
): boolean {
  if (!currentUser) return false;
  if (isUserSuperAdmin(currentUser, allRoles)) return true;

  const hasAssignments = (currentUser.assignments?.length ?? 0) > 0;
  if (hasAssignments) {
    // Role name can match before permission rows hydrate (stale/partial cache) —
    // don't paint Access Denied until the mapped role has a matrix.
    const matrixReady = currentUser.assignments.some((a) => {
      const role = findRoleForAssignment(a, allRoles);
      return role != null && (role.permissions?.length ?? 0) > 0;
    });
    if (matrixReady) return true;
    // Wait only while bootstrap still in flight — never spin forever after it settles.
    if (!options.dataInitialized && !options.bootstrapFailed) return false;
    return true;
  }

  if (options.bootstrapFailed || options.dataInitialized) return true;
  return false;
}
