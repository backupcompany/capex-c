/** True when UnauthorizedException means "no app user row" — not session/JWT infra. */
export function isAppUserLookupUnauthorized(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('user lookup failed') ||
    m.includes('user not registered') ||
    m.includes('not registered in application') ||
    m.includes('account not authorized for this application')
  );
}

/** PostgREST/DB outage — must never be shown as "akun belum terdaftar". */
export function isPostgrestInfraError(error: {
  message?: string | null;
  code?: string | null;
} | null | undefined): boolean {
  if (!error) return false;
  const m = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    m.includes('pgrst002') ||
    m.includes('pgrst001') ||
    m.includes('schema cache') ||
    m.includes('could not query the database') ||
    m.includes('econnrefused') ||
    m.includes('econnreset') ||
    m.includes('connection refused') ||
    m.includes('connection terminated') ||
    m.includes('timeout') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('upstream')
  );
}

export const DB_UNAVAILABLE_LOGIN_MSG =
  'Database Capex sedang tidak tersedia. Coba lagi sebentar atau hubungi admin.';
