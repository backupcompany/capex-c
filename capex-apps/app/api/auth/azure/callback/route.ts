import { NextResponse } from 'next/server';
import { proxyAuthRedirectToBackend } from '@/lib/auth/authBff';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // Drop hash fragment if present; only forward query (code/state/error).
    return await proxyAuthRedirectToBackend(`/azure/callback${url.search}`, req);
  } catch {
    const q = `/?oauth_error=${encodeURIComponent('Login Microsoft gagal di callback. Coba lagi.')}`;
    return NextResponse.redirect(new URL(q, req.url), 302);
  }
}
