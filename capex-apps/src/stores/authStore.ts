import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { User } from '../types';
import { IDLE_TIMEOUT_MS } from '../lib/auth/authConstants';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

type AuthState = {
  status: AuthStatus;
  user: User | null;
  roles: string[];
  idleTimeoutMs: number;
  /** True after /auth/session probe finishes (success or anonymous). */
  authProbeComplete: boolean;
  /** True after startup session probe + CSRF bootstrap — safe to POST /api/be. */
  sessionReady: boolean;
  setSession: (user: User, roles?: string[], idleTimeoutMs?: number) => void;
  clearSession: () => void;
  setStatus: (status: AuthStatus) => void;
  setAuthProbeComplete: (complete: boolean) => void;
  setSessionReady: (ready: boolean) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,
  roles: [],
  idleTimeoutMs: IDLE_TIMEOUT_MS,
  authProbeComplete: false,
  sessionReady: false,
  setSession: (user, roles = [], idleTimeoutMs = IDLE_TIMEOUT_MS) =>
    set({ status: 'authenticated', user, roles, idleTimeoutMs }),
  clearSession: () =>
    set({
      status: 'anonymous',
      user: null,
      roles: [],
      idleTimeoutMs: IDLE_TIMEOUT_MS,
      // Keep authProbeComplete — guest/logout still finished the session probe.
      sessionReady: false,
    }),
  setStatus: (status) => set({ status }),
  setAuthProbeComplete: (authProbeComplete) => set({ authProbeComplete }),
  setSessionReady: (sessionReady) => set({ sessionReady }),
}));

/** Memoized selectors — avoid global rerenders. */
export function useAuthUser(): User | null {
  return useAuthStore(useShallow((s) => s.user));
}

export function useAuthStatus(): AuthStatus {
  return useAuthStore((s) => s.status);
}

export function useAuthIdleTimeoutMs(): number {
  return useAuthStore((s) => s.idleTimeoutMs);
}

export function useSessionReady(): boolean {
  return useAuthStore((s) => s.sessionReady);
}

export function useAuthProbeComplete(): boolean {
  return useAuthStore((s) => s.authProbeComplete);
}

/** Shared gate — probe done, CSRF ok, authenticated user (JWT). */
export function useAuthenticatedNetworkReady(): boolean {
  return useAuthStore(
    useShallow(
      (s) =>
        s.authProbeComplete &&
        s.sessionReady &&
        s.status === 'authenticated' &&
        Boolean(s.user?.id),
    ),
  );
}
