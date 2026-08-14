import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { CSRF_COOKIE, CSRF_HEADER } from './authConstants';
import {
  applyBackendSetCookies,
  applySetCookiesToResponse,
  authCookieHeaderFromStore,
  collectSetCookies,
} from './authCookies.server';
import { REQUEST_ID_HEADER, resolveRequestId } from '../http/requestId';

export const ACCESS_COOKIE = 'capex_access';
export const REFRESH_COOKIE = 'capex_refresh';

function defaultBackendBase(): string {
  return (process.env.NEXT_PUBLIC_CAPEXBE_URL || process.env.CAPEXBE_URL || '')
    .replace(/\/$/, '')
    .trim();
}

/**
 * Auth backend for BFF.
 * SSO/session must hit the process that has AZURE_* + establishSession (monolith by default).
 * Leaf override only when CAPEX_SERVICE_AUTH_URL is set AND CAPEX_AUTH_USE_LEAF=1.
 */
function authBackendBase(): string {
  const useLeaf =
    process.env.CAPEX_AUTH_USE_LEAF === '1' || process.env.CAPEX_AUTH_USE_LEAF === 'true';
  const override = process.env.CAPEX_SERVICE_AUTH_URL?.trim().replace(/\/$/, '');
  if (useLeaf && override) return override;
  return defaultBackendBase();
}

/**
 * Keep post-OAuth redirects on the BFF host that just set cookies.
 * Absolute FRONTEND_URL mismatches used to drop the session after Microsoft return.
 * Microsoft authorize URLs stay absolute.
 */
function browserRedirectLocation(location: string): string {
  if (location.startsWith('/')) return location;
  try {
    const u = new URL(location);
    const host = u.hostname.toLowerCase();
    if (host.includes('microsoftonline.com') || host.includes('login.microsoft.com')) {
      return location;
    }
    return `${u.pathname}${u.search}${u.hash}` || '/';
  } catch {
    return '/';
  }
}

export async function proxyAuthToBackend(
  path: string,
  init: RequestInit,
  incomingReq?: Request,
): Promise<NextResponse> {
  const base = authBackendBase();
  if (!base) {
    return NextResponse.json({ message: 'Backend not configured' }, { status: 503 });
  }

  const cookieStore = await cookies();
  const cookieHeader = authCookieHeaderFromStore(cookieStore);

  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (cookieHeader) headers.set('Cookie', cookieHeader);

  const csrfFromClient = incomingReq?.headers.get(CSRF_HEADER);
  if (csrfFromClient && !headers.has(CSRF_HEADER)) {
    headers.set(CSRF_HEADER, csrfFromClient);
  }
  const csrfFromStore = cookieStore.get(CSRF_COOKIE)?.value;
  if (csrfFromStore && !headers.has(CSRF_HEADER)) {
    headers.set(CSRF_HEADER, csrfFromStore);
  }
  headers.set(REQUEST_ID_HEADER, resolveRequestId(incomingReq?.headers.get('x-request-id')));

  let res: Response;
  try {
    res = await fetch(`${base}/auth${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
  } catch (err) {
    const code =
      err != null && typeof err === 'object' && 'cause' in err
        ? String((err as { cause?: { code?: string } }).cause?.code ?? '')
        : '';
    const unreachable =
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      (err instanceof Error && err.message.includes('fetch failed'));
    return NextResponse.json(
      {
        message: unreachable
          ? `Backend tidak berjalan di ${base}. Jalankan: cd capexbe && npm run start:dev`
          : 'Backend tidak dapat dihubungi',
        statusCode: 503,
      },
      { status: 503 },
    );
  }

  const setCookies = collectSetCookies(res);
  const body = await res.text();
  const out = new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });

  await applySetCookiesToResponse(out, setCookies);
  await applyBackendSetCookies(cookieStore, setCookies);

  if (path === '/logout' && res.ok) {
    out.cookies.delete(ACCESS_COOKIE);
    out.cookies.delete(REFRESH_COOKIE);
    out.cookies.delete(CSRF_COOKIE);
  }

  return out;
}

/** Proxy GET auth route that returns a redirect (OAuth start/callback). */
export async function proxyAuthRedirectToBackend(
  path: string,
  incomingReq?: Request,
): Promise<NextResponse> {
  const base = authBackendBase();
  if (!base) {
    return NextResponse.json({ message: 'Backend not configured' }, { status: 503 });
  }

  const cookieStore = await cookies();
  const cookieHeader = authCookieHeaderFromStore(cookieStore);

  const headers = new Headers();
  if (cookieHeader) headers.set('Cookie', cookieHeader);

  let res: Response;
  try {
    res = await fetch(`${base}/auth${path}`, {
      method: 'GET',
      headers,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ message: 'Backend tidak dapat dihubungi' }, { status: 503 });
  }

  const setCookies = collectSetCookies(res);
  const location = res.headers.get('location');
  if (location && res.status >= 300 && res.status < 400) {
    const out = NextResponse.redirect(
      browserRedirectLocation(location),
      res.status === 303 ? 303 : 302,
    );
    await applySetCookiesToResponse(out, setCookies);
    await applyBackendSetCookies(cookieStore, setCookies);
    return out;
  }

  const body = await res.text();
  const out = new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
  await applySetCookiesToResponse(out, setCookies);
  await applyBackendSetCookies(cookieStore, setCookies);
  return out;
}
