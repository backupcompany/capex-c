import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { proxyAuthToBackend, ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/authBff';
import { CSRF_COOKIE } from '@/lib/auth/authConstants';

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const hadRefresh = Boolean(cookieStore.get(REFRESH_COOKIE)?.value?.trim());
  // No refresh cookie → soft miss (204). Avoids browser red 401 on login/guest probes.
  if (!hadRefresh) {
    const out = new NextResponse(null, { status: 204 });
    out.cookies.delete(ACCESS_COOKIE);
    out.cookies.delete(REFRESH_COOKIE);
    out.cookies.delete(CSRF_COOKIE);
    return out;
  }
  const res = await proxyAuthToBackend('/refresh', { method: 'POST' }, req);
  if (res.status === 401 || res.status === 403) {
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    res.cookies.delete(CSRF_COOKIE);
  }
  return res;
}
