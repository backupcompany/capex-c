/** Content-Security-Policy helpers — nonce set in middleware for production. */

export function generateCspNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

/** True when deployment is served over HTTPS (proxy proto or FORCE_HTTPS). */
export function requestIsHttps(requestHeaders?: Headers | null): boolean {
  if (process.env.FORCE_HTTPS === '1' || process.env.FORCE_HTTPS === 'true') return true;
  const proto = requestHeaders?.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  return proto === 'https';
}

/**
 * Cookie Secure flag — do NOT tie to NODE_ENV alone (breaks HTTP LAN / IP access).
 * COOKIE_SECURE=0|false forces off; =1|true forces on; else follow HTTPS proto / FORCE_HTTPS.
 */
export function shouldUseSecureCookies(requestHeaders?: Headers | null): boolean {
  const override = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (override === '0' || override === 'false') return false;
  if (override === '1' || override === 'true') return true;
  return requestIsHttps(requestHeaders);
}

export function buildContentSecurityPolicy(
  nonce: string,
  isProd: boolean,
  opts?: { enforceHttps?: boolean },
): string {
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  const enforceHttps = Boolean(opts?.enforceHttps);

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data:",
    "object-src 'none'",
    // Only when TLS is actually terminating — otherwise browsers upgrade /_next → https and fail on :443.
    ...(isProd && enforceHttps ? ['upgrade-insecure-requests'] : []),
    "connect-src 'self' https: http: wss: ws:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export function buildBaselineSecurityHeaders(
  isProd: boolean,
  opts?: { enforceHttps?: boolean },
): Record<string, string> {
  const enforceHttps = Boolean(opts?.enforceHttps);
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...(isProd && enforceHttps
      ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
      : {}),
  };
}

export function applySecurityHeaders(
  res: Response,
  opts: { nonce?: string; isProd: boolean; enforceHttps?: boolean },
): void {
  const enforceHttps = Boolean(opts.enforceHttps);
  const baseline = buildBaselineSecurityHeaders(opts.isProd, { enforceHttps });
  for (const [key, value] of Object.entries(baseline)) {
    res.headers.set(key, value);
  }
  if (opts.isProd && opts.nonce) {
    res.headers.set(
      'Content-Security-Policy',
      buildContentSecurityPolicy(opts.nonce, true, { enforceHttps }),
    );
  }
}
