'use client';

import { CSRF_COOKIE, CSRF_HEADER } from './authConstants';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

let csrfBootstrapInFlight: Promise<boolean> | null = null;

/**
 * Session may exist without a readable CSRF cookie (stale tab, HMR, pre-CSRF session).
 * GET /api/auth/session re-issues capex_csrf when authenticated — call before mutating /api/be.
 */
export async function ensureCsrfToken(): Promise<boolean> {
  if (readCookie(CSRF_COOKIE)) return true;
  if (typeof window === 'undefined') return false;

  if (!csrfBootstrapInFlight) {
    csrfBootstrapInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return false;
        return Boolean(readCookie(CSRF_COOKIE));
      } catch {
        return false;
      } finally {
        csrfBootstrapInFlight = null;
      }
    })();
  }

  return csrfBootstrapInFlight;
}

/** Attach CSRF double-submit header for state-changing requests (async — bootstraps token if needed). */
export async function withCsrfHeadersAsync(init?: RequestInit): Promise<RequestInit> {
  let token = readCookie(CSRF_COOKIE);
  if (!token) {
    await ensureCsrfToken();
    token = readCookie(CSRF_COOKIE);
  }
  if (!token) return init ?? {};
  const headers = new Headers(init?.headers);
  if (!headers.has(CSRF_HEADER)) {
    headers.set(CSRF_HEADER, token);
  }
  return { ...init, headers };
}

/** Attach CSRF double-submit header for state-changing requests. */
export function withCsrfHeaders(init?: RequestInit): RequestInit {
  const token = readCookie(CSRF_COOKIE);
  if (!token) return init ?? {};
  const headers = new Headers(init?.headers);
  if (!headers.has(CSRF_HEADER)) {
    headers.set(CSRF_HEADER, token);
  }
  return { ...init, headers };
}

export function getCsrfToken(): string | null {
  return readCookie(CSRF_COOKIE);
}

/** Clear readable CSRF cookie when server session is gone (httpOnly cookies cleared via BFF). */
export function clearClientCsrfCookie(): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CSRF_COOKIE}=; Max-Age=0; path=/; SameSite=Strict${secure}`;
}
