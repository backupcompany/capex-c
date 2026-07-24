/** Content-Security-Policy helpers — nonce set in middleware for production. */

export function generateCspNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

export function buildContentSecurityPolicy(nonce: string, isProd: boolean): string {
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "object-src 'none'",
    ...(isProd ? ['upgrade-insecure-requests'] : []),
    "connect-src 'self' https: wss: ws:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export function buildBaselineSecurityHeaders(isProd: boolean): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...(isProd
      ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
      : {}),
  };
}

export function applySecurityHeaders(
  res: Response,
  opts: { nonce?: string; isProd: boolean },
): void {
  const baseline = buildBaselineSecurityHeaders(opts.isProd);
  for (const [key, value] of Object.entries(baseline)) {
    res.headers.set(key, value);
  }
  if (opts.isProd && opts.nonce) {
    res.headers.set('Content-Security-Policy', buildContentSecurityPolicy(opts.nonce, true));
  }
}
