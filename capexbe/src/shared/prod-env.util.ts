export const DEFAULT_JWT_SECRET = 'change-me-use-openssl-rand-base64-48';

/** Dev-only fallback origin — never used when assertProductionCors() passes. */
export const DEV_LOCAL_ORIGIN = 'http://localhost:3000';

export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  if (process.env.METRICS_PUBLIC === '1') {
    throw new Error('Production startup blocked — METRICS_PUBLIC must not be set in production');
  }

  const missing: string[] = [];
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.SUPABASE_JWT_SECRET?.trim()) missing.push('SUPABASE_JWT_SECRET');
  if (!process.env.JWT_ACCESS_SECRET?.trim()) missing.push('JWT_ACCESS_SECRET');
  if (!process.env.SUPABASE_URL?.trim()) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_ANON_KEY?.trim()) missing.push('SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    throw new Error(`Production startup blocked — missing env: ${missing.join(', ')}`);
  }

  // In-stack Docker PostgREST (USE_VPS_POSTGRES≠1): never point at host loopback.
  // 127.0.0.1:54321 inside capex-api is the API container, not PostgREST.
  const useVps =
    process.env.USE_VPS_POSTGRES === '1' || process.env.USE_VPS_POSTGRES === 'true';
  const supabaseUrl = process.env.SUPABASE_URL!.trim();
  if (!useVps && /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/i.test(supabaseUrl)) {
    throw new Error(
      'Production startup blocked — SUPABASE_URL must be the Docker service (e.g. http://capex-postgrest), not 127.0.0.1/localhost',
    );
  }

  const jwtSecret = process.env.JWT_ACCESS_SECRET!.trim();
  if (jwtSecret === DEFAULT_JWT_SECRET || jwtSecret.length < 32) {
    throw new Error('Production startup blocked — JWT_ACCESS_SECRET must be a strong random value (≥32 chars)');
  }

  assertProductionCors();
}

/** Block localhost CORS fallback in production — must set explicit origin(s). */
export function assertProductionCors(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const cors = process.env.CORS_ORIGINS?.trim();
  if (!cors) {
    throw new Error('Production startup blocked — CORS_ORIGINS must be set');
  }
  const origins = cors.split(',').map((o) => o.trim()).filter(Boolean);
  const bad = origins.filter((o) => /localhost|127\.0\.0\.1/i.test(o));
  if (bad.length) {
    throw new Error(`Production startup blocked — CORS_ORIGINS must not include localhost (${bad.join(', ')})`);
  }
}

import { isPasswordLoginEnabledInMode } from './auth-mode.util';

export function isPasswordLoginDisabled(): boolean {
  // CAPEX_AUTH_MODE is source of truth (sso = no password form/API).
  return !isPasswordLoginEnabledInMode();
}

/** Comma-separated email domains for SSO + user provisioning.
 * Unset in SSO mode → default `siloamhospitals.com` (minimizes bad creates / false SSO).
 * Set `ALLOWED_EMAIL_DOMAINS=*` to allow any domain (dev only).
 */
export function getAllowedEmailDomains(): Set<string> | null {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS?.trim();
  if (!raw) {
    return isPasswordLoginDisabled() ? new Set(['siloamhospitals.com']) : null;
  }
  if (raw === '*' || raw.toLowerCase() === 'any') return null;
  const domains = raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return domains.length ? new Set(domains) : null;
}

export function emailDomainAllowed(email: string | undefined): boolean {
  const allowed = getAllowedEmailDomains();
  if (!allowed) return true;
  const domain = email?.split('@')[1]?.trim().toLowerCase();
  return Boolean(domain && allowed.has(domain));
}

/** User create/update — reject non-allowed domains before they hit SSO. */
export function assertEmailDomainAllowedForUser(email: string): void {
  const normalized = email.trim().toLowerCase();
  if (emailDomainAllowed(normalized)) return;
  const allowed = getAllowedEmailDomains();
  const list = allowed ? [...allowed].sort().join(', ') : 'siloamhospitals.com';
  throw new Error(
    `Email harus memakai domain yang diizinkan (${list}).`,
  );
}
