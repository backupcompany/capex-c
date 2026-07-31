import type { AuthSessionResponse } from './authApi';

let sessionMeta: AuthSessionResponse['session'] | null = null;
const listeners = new Set<(meta: AuthSessionResponse['session'] | null) => void>();

export function updateSessionMeta(meta: AuthSessionResponse['session'] | null | undefined): void {
  sessionMeta = meta ?? null;
  listeners.forEach((fn) => fn(sessionMeta));
}

export function getSessionMeta(): AuthSessionResponse['session'] | null {
  return sessionMeta;
}

export function subscribeSessionMeta(
  fn: (meta: AuthSessionResponse['session'] | null) => void,
): () => void {
  listeners.add(fn);
  fn(sessionMeta);
  return () => listeners.delete(fn);
}

export function clearSessionMeta(): void {
  updateSessionMeta(null);
}
