import { redactOutgoingUserIdJson } from '../redactApiUserId';
import { useBackendSession } from './authConstants';
import { coordinatedRefreshSession } from './authRefreshCoordinator';
import { authDebug } from './authDebug';
import { isAuthProbeComplete } from './authProbeGate';
import { isBackendSessionValid } from './sessionValidity';
import { withCsrfHeadersAsync } from './csrfToken';
import { secureInt } from '../secureId';

export type AuthenticatedFetchOptions = RequestInit & {
  /** Retry once after refresh on 401. Default true when backend session is enabled. */
  retryOn401?: boolean;
};

const MAX_401_RETRIES = 1;
const MAX_503_RETRIES = 1;
const RETRY_503_DELAY_MS = 900;
const RETRY_503_JITTER_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * fetch wrapper: on 401 (backend session mode), runs coordinated refresh then retries once.
 * On 503 (BE restarting / unreachable), retries briefly so dev HMR does not flash errors.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: AuthenticatedFetchOptions,
): Promise<Response> {
  const { retryOn401 = useBackendSession(), ...fetchInit } = init ?? {};
  const method = String(fetchInit.method ?? 'GET').toUpperCase();
  // GET/HEAD never need CSRF — bootstrapping via /api/auth/session here nested another
  // session fetch and Safari logged abort/HMR failures as "access control checks".
  const needsCsrf = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  let attempt401 = 0;
  let attempt503 = 0;
  let lastRes: Response | null = null;

  while (true) {
    const mergedInit = needsCsrf ? await withCsrfHeadersAsync(fetchInit) : fetchInit;
    let body = mergedInit.body;
    if (typeof body === 'string') {
      body = redactOutgoingUserIdJson(body);
    }
    const res = await fetch(input, {
      ...mergedInit,
      body,
      credentials: mergedInit.credentials ?? fetchInit.credentials ?? 'include',
    });
    lastRes = res;

    if (res.status === 503 && attempt503 < MAX_503_RETRIES) {
      attempt503 += 1;
      authDebug('fetch 503: retrying', {
        url: typeof input === 'string' ? input : input.toString(),
        attempt: attempt503,
      });
      await delay(RETRY_503_DELAY_MS * attempt503 + secureInt(RETRY_503_JITTER_MS));
      continue;
    }

    if (res.status !== 401 || !retryOn401 || attempt401 >= MAX_401_RETRIES) {
      return res;
    }

    authDebug('fetch 401: attempting refresh', {
      url: typeof input === 'string' ? input : input.toString(),
      attempt: attempt401,
    });

    const refreshed = await coordinatedRefreshSession();
    if (!refreshed) {
      const stillValid = await isBackendSessionValid();
      // Cookie hint must NOT gate logout: refresh 401 often clears cookies first, then
      // hasSessionCookieHint() is false while Zustand is still authenticated → poll spam.
      if (stillValid) {
        authDebug('fetch 401: refresh failed but session still valid — keep session');
        return res;
      }
      if (!isAuthProbeComplete()) {
        authDebug('fetch 401: auth probe pending — skip logout');
        return res;
      }
      authDebug('fetch 401: session invalid — cleanup');
      const { invalidateStaleAuthCookies, invalidateAuthProbeCache, clearServerAuthCookies } =
        await import('./authApi');
      invalidateStaleAuthCookies();
      invalidateAuthProbeCache();
      void clearServerAuthCookies();
      const { useAuthStore } = await import('../../stores/authStore');
      if (useAuthStore.getState().status === 'authenticated') {
        const { notifyAuthFailure } = await import('./authFailureHandler');
        notifyAuthFailure();
      }
      return res;
    }

    attempt401 += 1;
  }

  return lastRes!;
}
