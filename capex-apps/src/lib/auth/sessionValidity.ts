import type { AuthSessionResponse } from './authApi';
import { fetchAuthSession } from './authApi';
import { hasSessionCookieHint } from './sessionCookieHint';

export type SessionProbeState = 'authenticated' | 'unauthenticated' | 'unknown';

/** null/503/network = unknown — never treat as logged out. */
export function classifyAuthSessionResponse(
  me: AuthSessionResponse | null | undefined,
): SessionProbeState {
  if (me == null) return 'unknown';
  return me.authenticated ? 'authenticated' : 'unauthenticated';
}

export function isDefinitiveUnauthenticated(
  me: AuthSessionResponse | null | undefined,
): boolean {
  return classifyAuthSessionResponse(me) === 'unauthenticated';
}

/**
 * Lightweight session check — reuses fetchAuthSession dedupe (no parallel /session).
 * Returns true on transient failures when session cookies still present (avoid false logout).
 */
export async function isBackendSessionValid(): Promise<boolean> {
  try {
    const me = await fetchAuthSession();
    const state = classifyAuthSessionResponse(me);
    if (state === 'authenticated') return true;
    if (state === 'unknown') {
      return hasSessionCookieHint();
    }
    return false;
  } catch {
    return hasSessionCookieHint();
  }
}
