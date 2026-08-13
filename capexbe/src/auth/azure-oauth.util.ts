import { createHash } from 'node:crypto';

export type AzureOAuthConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

export function getAzureOAuthConfig(): AzureOAuthConfig | null {
  const tenantId = (process.env.AZURE_TENANT_ID || '').trim();
  const clientId = (process.env.AZURE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.AZURE_CLIENT_SECRET || '').trim();
  if (!tenantId || !clientId || !clientSecret) return null;
  return { tenantId, clientId, clientSecret };
}

export function azureAuthorizeUrl(
  cfg: AzureOAuthConfig,
  opts: { redirectUri: string; codeChallenge: string; state?: string },
): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: opts.redirectUri,
    response_mode: 'query',
    scope: 'openid email profile offline_access',
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
  });
  if (opts.state) params.set('state', opts.state);
  return `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeAzureAuthCode(
  cfg: AzureOAuthConfig,
  opts: { code: string; codeVerifier: string; redirectUri: string },
): Promise<{ idToken: string; accessToken?: string }> {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
    scope: 'openid email profile offline_access',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { error_description?: string; error?: string };
      detail = parsed.error_description ?? parsed.error ?? text;
    } catch {
      /* raw */
    }
    throw new Error(detail || 'Azure token exchange failed');
  }

  const payload = JSON.parse(text) as { id_token?: string; access_token?: string };
  const idToken = payload.id_token?.trim() ?? '';
  if (!idToken) throw new Error('Azure did not return id_token');
  return { idToken, accessToken: payload.access_token };
}

/** Decode JWT payload (token from Azure HTTPS + client_secret). Validates aud/tid/exp. */
export function emailFromAzureIdToken(idToken: string, cfg: AzureOAuthConfig): string {
  const parts = idToken.split('.');
  if (parts.length < 2) throw new Error('Invalid Azure id_token');
  const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
    'utf8',
  );
  const claims = JSON.parse(json) as Record<string, unknown>;

  if (claims.aud != null && String(claims.aud) !== cfg.clientId) {
    throw new Error('Azure id_token audience mismatch');
  }
  if (claims.tid != null && String(claims.tid) !== cfg.tenantId) {
    throw new Error('Azure id_token tenant mismatch');
  }
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now() - 60_000) {
    throw new Error('Azure id_token expired');
  }

  const email = [claims.email, claims.preferred_username, claims.upn]
    .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
    .find((v) => v.includes('@'));

  if (!email) throw new Error('Microsoft did not return an email claim');
  return email;
}

/** Stable auth_id stub when users.auth_id empty (Azure SSO without GoTrue). */
export function azureAuthIdForEmail(email: string): string {
  return `azure-${createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32)}`;
}
