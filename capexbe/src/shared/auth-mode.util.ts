/** password | sso | both — set CAPEX_AUTH_MODE in capexbe/.env (mirror NEXT_PUBLIC_CAPEX_AUTH_MODE on FE). */
export type CapexAuthMode = 'password' | 'sso' | 'both';

export function getAuthMode(): CapexAuthMode {
  const raw = (process.env.CAPEX_AUTH_MODE || '').trim().toLowerCase();
  if (raw === 'password' || raw === 'sso' || raw === 'both') return raw;
  // Default: Microsoft SSO only (no email/password API).
  return 'sso';
}

export function isSsoLoginEnabled(): boolean {
  const mode = getAuthMode();
  return mode === 'sso' || mode === 'both';
}

export function isPasswordLoginEnabledInMode(): boolean {
  if (process.env.DISABLE_PASSWORD_LOGIN === 'true') return false;
  const mode = getAuthMode();
  return mode === 'password' || mode === 'both';
}
