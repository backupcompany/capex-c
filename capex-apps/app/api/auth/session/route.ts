import { proxyAuthToBackend } from '@/lib/auth/authBff';

export async function GET() {
  return proxyAuthToBackend('/session', { method: 'GET' });
}
