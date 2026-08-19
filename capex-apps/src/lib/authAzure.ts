/**
 * Azure SSO — browser only redirects to backend OAuth; no Supabase keys in bundle.
 */

export const OAUTH_ERROR_STORAGE_KEY = 'auth_oauth_error';
/** Set before navigating to Microsoft; forces /auth/session probe on return even if cookies miss SSR. */
export const SSO_RETURN_STORAGE_KEY = 'capex_sso_return';

export const humanizeOAuthError = (raw: string): string => {
  const msg = decodeURIComponent(raw).toLowerCase();
  if (msg.includes('unable to exchange external code') || msg.includes('redirect_uri')) {
    return 'Konfigurasi Azure belum benar. Periksa Redirect URI di Azure App Registration.';
  }
  if (msg.includes('error getting user email') || msg.includes('did not return an email')) {
    return 'Microsoft tidak mengirim email. Pastikan scope email aktif di Azure App.';
  }
  if (msg.includes('access_denied') || msg.includes('consent_required')) {
    return 'Login Microsoft dibatalkan. Silakan coba lagi dengan akun yang benar.';
  }
  if (
    msg.includes('tidak terdaftar') ||
    msg.includes('tidak memiliki akses') ||
    msg.includes('akun microsoft salah') ||
    msg.includes('user lookup failed') ||
    msg.includes('not registered')
  ) {
    return 'Akun Microsoft salah atau belum terdaftar di Capex Pro. Coba akun lain atau hubungi admin.';
  }
  if (msg.includes('tidak diizinkan') || msg.includes('siloamhospitals')) {
    return 'Akun email tidak diizinkan. Gunakan akun Microsoft Siloam, atau coba akun lain.';
  }
  if (
    msg.includes('could not create session') ||
    msg.includes('database not configured') ||
    msg.includes('jwt secret') ||
    msg.includes('sesi capex gagal')
  ) {
    return 'Login Microsoft berhasil, tapi sesi Capex gagal dibuat. Hubungi admin (session/database).';
  }
  return raw;
};

/** PKCE / query callback only — implicit hash tokens are rejected (security). */
export const isOAuthCallbackFromUrl = (): boolean => {
  if (typeof window === 'undefined') return false;
  const queryParams = new URLSearchParams(window.location.search);
  if (queryParams.get('oauth_error')) return true;
  if (queryParams.get('code')) return true;
  if (queryParams.get('error')) return true;
  return false;
};

export const getOAuthErrorFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  const queryParams = new URLSearchParams(window.location.search);
  const fromQuery = queryParams.get('oauth_error');
  if (fromQuery?.trim()) return humanizeOAuthError(fromQuery.trim());

  const err = queryParams.get('error_description') || queryParams.get('error');
  return err?.trim() ? humanizeOAuthError(err.trim()) : null;
};

export const clearOAuthParamsFromUrl = (): void => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.delete('oauth_error');
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  url.searchParams.delete('state');
  const next = `${url.pathname}${url.search}`;
  window.history.replaceState({}, '', next || '/');
};

export const consumeOAuthError = (): string | null => {
  if (typeof window === 'undefined') return null;
  const fromUrl = getOAuthErrorFromUrl();
  if (fromUrl) {
    clearOAuthParamsFromUrl();
    return fromUrl;
  }
  const msg = sessionStorage.getItem(OAUTH_ERROR_STORAGE_KEY);
  if (msg) sessionStorage.removeItem(OAUTH_ERROR_STORAGE_KEY);
  return msg;
};

import { sanitizeOAuthReturnTo } from './auth/oauthReturnTo';
import { LOGIN_PATH, POST_LOGIN_PATH } from './auth/loginRoute';

export const signInWithAzure = async (): Promise<{ error: Error | null }> => {
  if (typeof window === 'undefined') {
    return { error: new Error('Login Microsoft hanya tersedia di browser.') };
  }
  // Reset prior SSO failure state so a new account attempt is not blocked by stale cookies/hints.
  try {
    sessionStorage.removeItem(OAUTH_ERROR_STORAGE_KEY);
    sessionStorage.setItem(SSO_RETURN_STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
  const { clearServerAuthCookies, invalidateAuthProbeCache, setSessionCookieHint } =
    await import('./auth/authApi');
  invalidateAuthProbeCache();
  setSessionCookieHint(false);
  await clearServerAuthCookies();

  const path = window.location.pathname || POST_LOGIN_PATH;
  const returnTarget = path === LOGIN_PATH ? POST_LOGIN_PATH : path;
  const returnTo = encodeURIComponent(sanitizeOAuthReturnTo(returnTarget, POST_LOGIN_PATH));
  window.location.assign(`/api/auth/azure/start?returnTo=${returnTo}`);
  return { error: null };
};

/** PKCE callback sets httpOnly cookies server-side; client only surfaces OAuth errors. */
export const probeOAuthCallbackIfPresent = async (): Promise<null> => {
  if (!isOAuthCallbackFromUrl()) return null;
  const urlError = getOAuthErrorFromUrl();
  clearOAuthParamsFromUrl();
  if (urlError && typeof window !== 'undefined') {
    sessionStorage.setItem(OAUTH_ERROR_STORAGE_KEY, urlError);
  }
  return null;
};

export const signOutSupabaseAuth = async (): Promise<void> => {
  /* session cleared via logoutBackend */
};

export const hasSupabaseAuthSession = async (): Promise<boolean> => false;
