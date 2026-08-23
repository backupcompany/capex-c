import { maskEmail, maskPhone, maskTaxId } from './pii-hash.util';
import { encodeUserPublicId } from './public-id.util';

/** DB columns safe to load for user directory (never auth_id / password). */
export const USER_DIRECTORY_COLUMNS = 'id,username,email,phone_number';

const CACHE_PII_KEYS = new Set([
  'email',
  'phone',
  'phoneNumber',
  'phone_number',
  'npwp',
  'taxId',
  'tax_id',
]);

/**
 * Deep-mask PII before Redis/shared cache write.
 * Privileged viewers must not rely on cache for full PII (reload / process cache).
 */
export function maskPiiForCache<T>(value: T): T {
  return maskPiiNode(value) as T;
}

function maskPiiNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskPiiNode);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (CACHE_PII_KEYS.has(key) && typeof child === 'string' && child.trim()) {
      if (key === 'email') out[key] = maskEmail(child);
      else if (key === 'npwp' || key === 'taxId' || key === 'tax_id') out[key] = maskTaxId(child);
      else out[key] = maskPhone(child);
      continue;
    }
    out[key] = maskPiiNode(child);
  }
  return out;
}

export type DirectoryUser = {
  /** Omitted in API egress unless viewer manages users (config admin). */
  id?: number;
  publicId: string;
  username: string;
  email?: string;
  phoneNumber?: string;
  assignments: Array<{ roleName: string; assignedScopes: string[] }>;
};

const INTERNAL_USER_KEYS = new Set([
  'authId',
  'auth_id',
  'password',
  'passwordHash',
  'password_hash',
]);

export function stripInternalUserFields(user: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(user)) {
    if (!INTERNAL_USER_KEYS.has(key)) out[key] = value;
  }
  return out;
}

/** Directory payload: full PII for self or privileged viewers; masked for everyone else. */
export function sanitizeUserForDirectory(
  user: Record<string, unknown>,
  viewerUserId: number,
  includePii: boolean,
  exposeNumericId = false,
): DirectoryUser {
  const base = stripInternalUserFields(user);
  const id = Number(base.id);
  const assignments = Array.isArray(base.assignments) ? base.assignments : [];
  const isSelf = Number(viewerUserId) === id;

  const out: DirectoryUser = {
    publicId: encodeUserPublicId(id),
    username: String(base.username ?? ''),
    assignments: assignments as DirectoryUser['assignments'],
  };
  if (exposeNumericId) {
    out.id = id;
  }

  const email = String(base.email ?? '').trim();
  const phoneRaw = base.phoneNumber ?? base.phone_number;
  const phone = phoneRaw != null ? String(phoneRaw).trim() : '';

  if (includePii || isSelf) {
    if (email) out.email = email;
    if (phone) out.phoneNumber = phone;
  } else {
    if (email) out.email = maskEmail(email);
    if (phone) out.phoneNumber = maskPhone(phone);
  }

  return out;
}

export function sanitizeUsersForDirectory(
  users: Record<string, unknown>[],
  viewerUserId: number,
  includePii: boolean,
  exposeNumericId = false,
): DirectoryUser[] {
  return users.map((u) => sanitizeUserForDirectory(u, viewerUserId, includePii, exposeNumericId));
}

/** View-only Configuration: role labels only — no permission matrix egress. */
export function sanitizeRolesForViewer(
  roles: Record<string, unknown>[],
  includePermissionMatrix: boolean,
): Record<string, unknown>[] {
  if (includePermissionMatrix) return roles;
  return roles.map((role) => {
    const { permissions: _drop, ...rest } = role;
    return { ...rest, permissions: [] };
  });
}
