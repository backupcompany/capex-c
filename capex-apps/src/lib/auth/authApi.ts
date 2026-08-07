import type { User } from '../../types';
import { useBackendSession } from './authConstants';
import { coordinatedRefreshSession } from './authRefreshCoordinator';
import { authenticatedFetch } from './authenticatedFetch';
import { clearClientCsrfCookie, withCsrfHeaders } from './csrfToken';
import { hasSessionCookieHint, setSessionCookieHint } from './sessionCookieHint';
import { clearTabSessionState } from './clearTabSessionState';
import { updateSessionMeta, clearSessionMeta } from './sessionMetaStore';
import { clearSupabaseSessionAfterExchange } from './signInForExchange';
import { readCachedAuthUser } from '../authSessionCache';
import { mergeAuthIdentityUser } from './mergeAuthIdentityUser';
import { normalizeAuthEmail, normalizeAuthPassword } from './normalizeAuthInput';

export type AuthSessionMeta = {
  accessExpiresAt: number;
  absoluteExpiresAt: number;
  idleTimeoutMs: number;
};

export type AuthSessionAssignment = {
  roleName: string;
  assignedScopes?: string[];
};

export type AuthSessionResponse = {
  authenticated: boolean;
  user?: {
    publicId?: string;
    id?: number;
    username: string;
    email: string;
    roles: string[];
    assignments?: AuthSessionAssignment[];
    idleTimeoutMs: number;
    session?: AuthSessionMeta;
  };
  session?: AuthSessionMeta;
};

let sessionInFlight: Promise<AuthSessionResponse | null> | null = null;

const PROBE_CACHE_MS = 4_000;
let lastProbeAt = 0;
let lastProbeResult: AuthSessionResponse | null = null;
let probeInFlight: Promise<AuthSessionResponse | null> | null = null;

function hasLocalSessionHint(): boolean {
  if (typeof window === 'undefined') return false;
  return hasSessionCookieHint();
}

function clearStaleClientSessionHints(): void {
  setSessionCookieHint(false);
  clearClientCsrfCookie();
}

export { setSessionCookieHint } from './sessionCookieHint';
export function invalidateStaleAuthCookies(): void {
  clearStaleClientSessionHints();
}

/** Best-effort: wipe httpOnly session cookies via BFF (no backend refresh — avoids login race). */
export async function clearServerAuthCookies(): Promise<void> {
  if (!useBackendSession() || typeof window === 'undefined') return;
  try {
    await fetch('/api/auth/clear-cookies', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    /* noop */
  }
  clearStaleClientSessionHints();
}

/** Clear cached probe result (logout / forced unauthenticated). */
export function invalidateAuthProbeCache(): void {
  lastProbeAt = 0;
  lastProbeResult = null;
  probeInFlight = null;
  sessionInFlight = null;
}

/**
 * Single deduped session probe for app startup.
 * Skips refresh when no local session hint (clean login page → no session probe).
 */
const PROBE_STALE_GRACE_MS = PROBE_CACHE_MS * 15;

export async function probeBackendSession(options?: {
  force?: boolean;
}): Promise<AuthSessionResponse | null> {
  if (!useBackendSession()) return { authenticated: false };

  const now = Date.now();
  if (!options?.force && probeInFlight) return probeInFlight;
  if (
    !options?.force &&
    lastProbeResult &&
    now - lastProbeAt < PROBE_CACHE_MS
  ) {
    return lastProbeResult;
  }

  probeInFlight = (async () => {
    const hadSessionHint = hasLocalSessionHint();
    let session = await fetchAuthSession();

    if (session == null) {
      if (lastProbeResult?.authenticated && now - lastProbeAt < PROBE_STALE_GRACE_MS) {
        return lastProbeResult;
      }
      return null;
    }

    if (!session.authenticated && hadSessionHint && hasSessionCookieHint()) {
      const refreshOk = await refreshBackendSessionCoordinated();
      if (refreshOk) {
        session = await fetchAuthSession();
        if (session == null) {
          return lastProbeResult?.authenticated ? lastProbeResult : null;
        }
      } else {
        const recheck = await fetchAuthSession();
        if (recheck != null && !recheck.authenticated) {
          clearStaleClientSessionHints();
          void clearServerAuthCookies();
          session = recheck;
        } else if (lastProbeResult?.authenticated) {
          return lastProbeResult;
        }
      }
    }

    lastProbeAt = Date.now();
    if (session != null) {
      lastProbeResult = session;
      return session;
    }
    return lastProbeResult?.authenticated ? lastProbeResult : null;
  })().finally(() => {
    probeInFlight = null;
  });

  return probeInFlight;
}

/** True when startup should call /api/auth/session (session cookies or OAuth in progress). */
export function shouldRunAuthSessionProbe(options: {
  hasSessionCookies?: boolean;
  oauthCallback?: boolean;
}): boolean {
  if (!useBackendSession()) return false;
  if (options.oauthCallback) return true;
  if (options.hasSessionCookies) return true;
  return false;
}

function backendBase(): string {
  return (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
}

function errorFromAuthResponse(
  status: number,
  body: { message?: string | string[]; error?: string },
): string {
  const msg = Array.isArray(body.message)
    ? body.message.join(', ')
    : body.message;
  if (msg) return msg;
  if (status === 429) {
    return 'Terlalu banyak percobaan login. Tunggu ±15 menit lalu coba lagi.';
  }
  if (status === 503) {
    return 'Auth service tidak berjalan. Jalankan: make run (atau make run-auth di port 3018).';
  }
  if (status === 404) {
    return 'Endpoint auth tidak ditemukan. Pastikan capexbe berjalan di port 3001.';
  }
  if (status >= 500) {
    return 'Server error. Pastikan capexbe berjalan dan coba lagi.';
  }
  return 'Could not establish session';
}

/** BFF or direct backend — always credentials for cookies. */
async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const useBff = typeof window !== 'undefined';
  const url = useBff ? `/api/auth${path}` : `${backendBase()}/auth${path}`;
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  const noRetryPaths = new Set(['/login', '/exchange', '/refresh', '/session', '/forgot-password']);
  const mergedInit = withCsrfHeaders({ ...init, headers });
  return authenticatedFetch(url, {
    ...mergedInit,
    credentials: 'include',
    retryOn401: useBackendSession() && !noRetryPaths.has(path),
  });
}

function sessionUserToAppUser(
  data: NonNullable<AuthSessionResponse['user']>,
): User {
  return mergeAuthIdentityUser(
    {
      publicId: data.publicId,
      id: data.id,
      username: data.username,
      email: data.email,
    },
    {
      sessionAssignments: data.assignments,
      roleSlugs: data.roles,
    },
  );
}

function parseAuthMePayload(raw: unknown): NonNullable<AuthSessionResponse['user']> | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = raw as Record<string, unknown>;
  const body =
    root.user && typeof root.user === 'object' && !Array.isArray(root.user)
      ? (root.user as Record<string, unknown>)
      : root;

  const publicId = typeof body.publicId === 'string' ? body.publicId.trim() : '';
  let id: number | undefined;
  if (typeof body.id === 'number' && Number.isFinite(body.id) && body.id > 0) {
    id = body.id;
  } else if (typeof body.id === 'string' && /^\d+$/.test(body.id.trim())) {
    id = Number(body.id.trim());
  }
  if (!publicId && id == null) return null;

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  if (!username) return null;

  return {
    publicId: publicId || undefined,
    id,
    username,
    email: typeof body.email === 'string' ? body.email : '',
    roles: Array.isArray(body.roles) ? (body.roles as string[]) : [],
    assignments: Array.isArray(body.assignments)
      ? (body.assignments as AuthSessionAssignment[])
      : undefined,
    idleTimeoutMs:
      typeof body.idleTimeoutMs === 'number' && Number.isFinite(body.idleTimeoutMs)
        ? body.idleTimeoutMs
        : 0,
    session:
      body.session && typeof body.session === 'object'
        ? (body.session as AuthSessionMeta)
        : undefined,
  };
}

async function loginWithServerPassword(
  email: string,
  password: string,
): Promise<{ user: User | null; roles: string[]; error: string | null }> {
  const cleanEmail = normalizeAuthEmail(email);
  const cleanPassword = normalizeAuthPassword(password);
  try {
    const res = await authFetch('/login', {
      method: 'POST',
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string | string[];
      };
      return {
        user: null,
        roles: [],
        error: errorFromAuthResponse(res.status, body),
      };
    }
    const data = parseAuthMePayload(await res.json());
    if (!data) {
      return {
        user: null,
        roles: [],
        error: 'Respons login tidak valid. Pastikan capexbe berjalan dan coba lagi.',
      };
    }
    if (data.session) updateSessionMeta(data.session);
    clearTabSessionState();
    setSessionCookieHint(true);
    try {
      return {
        user: sessionUserToAppUser(data),
        roles: Array.isArray(data.roles) ? data.roles : [],
        error: null,
      };
    } catch (err) {
      return {
        user: null,
        roles: [],
        error: err instanceof Error ? err.message : 'Login gagal',
      };
    }
  } catch {
    return { user: null, roles: [], error: 'Network error ke backend login' };
  }
}

/** Email/password sign-in via POST /api/auth/login (sets httpOnly session cookies). */
export async function loginWithBackend(
  email: string,
  password: string,
): Promise<{ user: User | null; roles: string[]; error: string | null }> {
  if (!useBackendSession()) {
    return { user: null, roles: [], error: 'Backend session disabled' };
  }
  return loginWithServerPassword(email, password);
}

/** Request password reset email via backend (Supabase Auth). */
export async function requestPasswordResetBackend(
  email: string,
  redirectTo?: string,
): Promise<{ error: string | null }> {
  if (!useBackendSession()) {
    return { error: 'Backend session disabled' };
  }
  try {
    const res = await authFetch('/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: normalizeAuthEmail(email), redirectTo }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string | string[];
      };
      return { error: errorFromAuthResponse(res.status, body) };
    }
    return { error: null };
  } catch {
    return { error: 'Network error ke backend forgot-password' };
  }
}

/** Change password for authenticated user (verifies current password server-side). */
export async function changePasswordBackend(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<{ error: string | null }> {
  if (!useBackendSession()) {
    return { error: 'Backend session disabled' };
  }
  try {
    const res = await authFetch('/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: normalizeAuthPassword(currentPassword),
        newPassword: normalizeAuthPassword(newPassword),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string | string[];
      };
      return { error: errorFromAuthResponse(res.status, body) };
    }
    return { error: null };
  } catch {
    return { error: 'Network error ke backend change-password' };
  }
}

export async function fetchAuthSession(): Promise<AuthSessionResponse | null> {
  if (!useBackendSession()) return null;
  if (sessionInFlight) return sessionInFlight;
  sessionInFlight = (async () => {
    try {
      const res = await authFetch('/session', { method: 'GET' });
      if (res.status === 503) {
        // Auth leaf mid-restart — keep session, do not treat as logged out.
        return null;
      }
      if (!res.ok) return { authenticated: false };
      const data = (await res.json()) as AuthSessionResponse;
      const session = data.user?.session ?? data.session;
      if (session) updateSessionMeta(session);
      return data;
    } catch {
      return null;
    } finally {
      sessionInFlight = null;
    }
  })();
  return sessionInFlight;
}

export async function logoutBackend(options?: {
  /** Revoke all server sessions for this user (manual sign-out). */
  allDevices?: boolean;
}): Promise<void> {
  if (!useBackendSession()) return;
  try {
    await authFetch('/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allDevices: options?.allDevices === true }),
    });
  } catch {
    /* noop */
  }
  await clearSupabaseSessionAfterExchange();
  clearSessionMeta();
}

export type RefreshSessionStatus = 'ok' | 'invalid' | 'transient';

export async function refreshBackendSessionWithStatus(): Promise<RefreshSessionStatus> {
  if (!useBackendSession()) return 'invalid';
  if (!hasSessionCookieHint()) return 'invalid';
  try {
    const res = await authFetch('/refresh', { method: 'POST' });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { session?: AuthSessionMeta } | null;
      if (data?.session) updateSessionMeta(data.session);
      return 'ok';
    }
    if (res.status === 401 || res.status === 403) {
      clearStaleClientSessionHints();
      return 'invalid';
    }
    return 'transient';
  } catch {
    return 'transient';
  }
}

export async function refreshBackendSession(): Promise<boolean> {
  return (await refreshBackendSessionWithStatus()) === 'ok';
}

/** Prefer this from app code — dedupes concurrent refresh across tabs. */
export async function refreshBackendSessionCoordinated(): Promise<boolean> {
  if (!useBackendSession()) return false;
  return coordinatedRefreshSession();
}

export async function heartbeatBackend(): Promise<boolean> {
  if (!useBackendSession()) return false;
  try {
    const res = await authFetch('/heartbeat', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}
