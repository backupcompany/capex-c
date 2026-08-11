/** password | sso | both — set CAPEX_AUTH_MODE in capexbe/.env (mirror NEXT_PUBLIC_CAPEX_AUTH_MODE on FE). */
export type CapexAuthMode = 'password' | 'sso' | 'both';

export function getAuthMode(): CapexAuthMode {
  const raw = (process.env.CAPEX_AUTH_MODE || '').trim().toLowerCase();
  if (raw === 'password' || raw === 'sso' || raw === 'both') return raw;
  if (process.env.CAPEX_DEMO_MODE === 'true') return 'both';
  if (process.env.NODE_ENV === 'production') return 'sso';
  return 'both';
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
