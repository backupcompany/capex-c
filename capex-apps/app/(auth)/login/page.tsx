import { cookies } from 'next/headers';
import { readHasSessionCookies } from '@/lib/auth/authCookies.server';
import { LoginRouteClient } from './LoginRouteClient';

export default async function LoginPageRoute() {
  const hasSessionCookies = readHasSessionCookies(await cookies());

  return <LoginRouteClient hasSessionCookies={hasSessionCookies} />;
}
