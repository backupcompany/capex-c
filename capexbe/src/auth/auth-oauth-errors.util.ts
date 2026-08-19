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
