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
  // Default: Microsoft SSO only (no email/password form).
  return 'sso';
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

/** Domains allowed for Super Admin user create (mirrors BE ALLOWED_EMAIL_DOMAINS). */
export function getAllowedEmailDomains(): string[] | null {
  const raw = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS || '').trim();
  if (raw === '*' || raw.toLowerCase() === 'any') return null;
  if (raw) {
    const domains = raw
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    return domains.length ? domains : null;
  }
  // SSO default — same as BE when ALLOWED_EMAIL_DOMAINS unset.
  if (!isPasswordLoginEnabled()) return ['siloamhospitals.com'];
  return null;
}

export function isAllowedCapexUserEmail(email: string): boolean {
  const allowed = getAllowedEmailDomains();
  if (!allowed) return true;
  const domain = email.split('@')[1]?.trim().toLowerCase();
  return Boolean(domain && allowed.includes(domain));
}

export function allowedEmailDomainsHint(): string {
  const allowed = getAllowedEmailDomains();
  return allowed?.length ? allowed.join(', ') : 'siloamhospitals.com';
}
