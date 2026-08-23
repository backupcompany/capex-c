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

/** VPS password allowlist (no GoTrue). SSO mode ignores this — demo only. */
export function getVpsLoginAccounts(): VpsLoginAccount[] {
  return [getDemoLoginCredentials()];
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
