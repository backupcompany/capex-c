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
