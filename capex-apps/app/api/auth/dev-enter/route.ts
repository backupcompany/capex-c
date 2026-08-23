import { proxyAuthToBackend } from '@/lib/auth/authBff';

/** Local demo one-click enter — backend rejects unless CAPEX_DEMO_MODE + non-production. */
export async function POST(req: Request) {
  return proxyAuthToBackend('/dev-enter', { method: 'POST' }, req);
}
