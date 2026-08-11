/** Alias for Supabase OAuth redirect (e.g. https://capex.cgp-ai.com/auth/callback). */
import { proxyAuthRedirectToBackend } from '@/lib/auth/authBff';

export async function GET(req: Request) {
  const url = new URL(req.url);
  return proxyAuthRedirectToBackend(`/azure/callback${url.search}`, req);
}
