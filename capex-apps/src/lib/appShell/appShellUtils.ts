import type { User, UserRole } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { useBackendSession } from '@/lib/auth/authConstants';

export function cloneRolesForApp(roles: UserRole[]): UserRole[] {
  return JSON.parse(JSON.stringify(roles)) as UserRole[];
}

export function sameUserSession(a: User, b: User): boolean {
  if (a.id !== b.id) return false;
  if (a.username !== b.username || a.email !== b.email) return false;
  return JSON.stringify(a.assignments) === JSON.stringify(b.assignments);
}

export function pushAuthSessionIfChanged(user: User, roleNames: string[]): void {
  if (!useBackendSession()) return;
  const prev = useAuthStore.getState().user;
  if (prev && sameUserSession(prev, user)) {
    const prevRoles = useAuthStore.getState().roles;
    if (JSON.stringify(prevRoles) === JSON.stringify(roleNames)) return;
  }
  queueMicrotask(() => useAuthStore.getState().setSession(user, roleNames));
}

export function trimSetToNewest(set: Set<string>, maxSize: number): Set<string> {
  if (set.size <= maxSize) return set;
  const arr = Array.from(set);
  return new Set(arr.slice(Math.max(0, arr.length - maxSize)));
}

export function safeParseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

export function safeWriteStorageArray(key: string, values: string[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}
