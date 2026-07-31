'use client';

import { useEffect } from 'react';
import { LoginPage } from '@/screens/LoginPage';
import {
  fetchAuthSession,
  shouldRunAuthSessionProbe,
} from '@/lib/auth/authApi';
import { isRecoveryFromUrl } from '@/lib/authSupabase';
import { isLoginPath, loginUrlWithSuffix, POST_LOGIN_PATH } from '@/lib/auth/loginRoute';
import { setSessionCookieHint } from '@/lib/auth/sessionCookieHint';

type Props = {
  /** From server cookies — skip session probe on clean login page. */
  hasSessionCookies: boolean;
};

export function LoginRouteClient({ hasSessionCookies }: Props) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    setSessionCookieHint(hasSessionCookies);

    if (isRecoveryFromUrl() && !isLoginPath(window.location.pathname)) {
      const suffix = window.location.hash || window.location.search;
      window.location.replace(loginUrlWithSuffix(suffix));
      return;
    }

    if (!shouldRunAuthSessionProbe({ hasSessionCookies })) return;

    let cancelled = false;
    void (async () => {
      const session = await fetchAuthSession();
      if (cancelled) return;
      if (session?.authenticated && session.user) {
        window.location.replace(POST_LOGIN_PATH);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasSessionCookies]);

  return <LoginPage />;
}
