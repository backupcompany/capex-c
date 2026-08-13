/** VPS Postgres + local PostgREST (USE_VPS_POSTGRES=1 in capexbe/.env). */
export function isVpsPostgresMode(): boolean {
  return process.env.USE_VPS_POSTGRES === '1' || process.env.USE_VPS_POSTGRES === 'true';
}

export function getDemoLoginCredentials(): { email: string; password: string } {
  return {
    email: (process.env.DEMO_LOGIN_EMAIL || 'demo@capex.local').trim().toLowerCase(),
    password: process.env.DEMO_LOGIN_PASSWORD || 'demo123',
  };
}

export type VpsLoginAccount = { email: string; password: string };

function pushEnvLogin(
  accounts: VpsLoginAccount[],
  emailEnv: string,
  passwordEnv: string,
): void {
  const email = (process.env[emailEnv] || '').trim().toLowerCase();
  const password = process.env[passwordEnv] || '';
  if (email && password) accounts.push({ email, password });
}

/**
 * VPS password allowlist (no GoTrue). Demo + optional accounts from env.
 * Passwords must come from env — never commit real secrets.
 */
export function getVpsLoginAccounts(): VpsLoginAccount[] {
  const accounts: VpsLoginAccount[] = [getDemoLoginCredentials()];
  pushEnvLogin(accounts, 'INFOSEC_ADMIN_EMAIL', 'INFOSEC_ADMIN_PASSWORD');
  pushEnvLogin(accounts, 'INFOSEC_VIEWER_EMAIL', 'INFOSEC_VIEWER_PASSWORD');
  pushEnvLogin(accounts, 'SSO_TEST_EMAIL', 'SSO_TEST_PASSWORD');
  pushEnvLogin(accounts, 'PENTEST_1_EMAIL', 'PENTEST_1_PASSWORD');
  pushEnvLogin(accounts, 'PENTEST_2_EMAIL', 'PENTEST_2_PASSWORD');
  return accounts;
}

/** Returns matched account email, or null. */
export function matchVpsLogin(email: string, password: string): string | null {
  const normalized = email.trim().toLowerCase();
  for (const account of getVpsLoginAccounts()) {
    if (account.email === normalized && account.password === password) {
      return account.email;
    }
  }
  return null;
}
