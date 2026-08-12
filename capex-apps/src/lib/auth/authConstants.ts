export const ACCESS_COOKIE = 'capex_access';
export const REFRESH_COOKIE = 'capex_refresh';
export const CSRF_COOKIE = 'capex_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';
export const OAUTH_PKCE_COOKIE = 'capex_oauth_pkce';
export const OAUTH_RETURN_COOKIE = 'capex_oauth_return';

/** Inactivity / tab-hidden logout (mirrors backend idle timeout). */
export const IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;
export const TAB_HIDDEN_TIMEOUT_MS = IDLE_TIMEOUT_MS;
/** Refresh access token 15 min before 3h access JWT expires. */
export const SESSION_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000 - 15 * 60 * 1000;

/** Use backend httpOnly session (recommended). */
export function useBackendSession(): boolean {
  const flag = process.env.NEXT_PUBLIC_USE_BACKEND_SESSION;
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return Boolean(process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim());
}

export type CapexAuthMode = 'password' | 'sso' | 'both';

function getAuthMode(): CapexAuthMode {
  const raw = (
    process.env.NEXT_PUBLIC_CAPEX_AUTH_MODE ||
    process.env.CAPEX_AUTH_MODE ||
    ''
  )
    .trim()
    .toLowerCase();
  if (raw === 'password' || raw === 'sso' || raw === 'both') return raw;
  if (process.env.NEXT_PUBLIC_ENABLE_AZURE_SSO === 'false') return 'password';
  if (process.env.NEXT_PUBLIC_CAPEX_DEMO_MODE === 'true') return 'both';
  // Explicit CAPEX_AUTH_MODE=sso for Microsoft-only. Do not hide password form just because NODE_ENV=production.
  return 'both';
}

/** Azure Entra ID SSO via backend OAuth. */
export function isAzureSsoEnabled(): boolean {
  const mode = getAuthMode();
  return mode === 'sso' || mode === 'both';
}

/** Email/password form on login page. */
export function isPasswordLoginEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === 'true') return true;
  const mode = getAuthMode();
  return mode === 'password' || mode === 'both';
}

export function getCapexAuthMode(): CapexAuthMode {
  return getAuthMode();
}
