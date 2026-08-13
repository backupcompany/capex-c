import {
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
  OAUTH_COOKIE_TTL_SEC,
  OAUTH_PKCE_COOKIE,
  OAUTH_RETURN_COOKIE,
  cookieSecureFlag,
} from './auth.constants';
import { emailDomainAllowed, DEV_LOCAL_ORIGIN } from '../shared/prod-env.util';
import { JwtTokenService } from './jwt-token.service';
import { SessionService } from './session.service';
import { AuthUserResolver } from './auth-user.resolver';
import { AuthAuditService } from './auth-audit.service';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { AuthAccountLockoutService } from './auth-account-lockout.service';
import { CsrfService } from './csrf.service';
import { SuspiciousLoginService } from './suspicious-login.service';
import { SupabaseJwtService } from './supabase-jwt.service';
import type { AuthMeDto, AuthSessionMetaDto } from './auth.types';
import { encodeUserPublicId } from '../shared/public-id.util';
import type { ResolvedAppUser } from './auth-user.resolver';
import { isTlsFetchError } from '../shared/tls-fetch-error';
import {
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';
import { generateCodeChallenge, generateCodeVerifier } from './oauth-pkce.util';
import {
  azureAuthorizeUrl,
  azureAuthIdForEmail,
  emailFromAzureIdToken,
  exchangeAzureAuthCode,
  getAzureOAuthConfig,
} from './azure-oauth.util';
import { isSsoLoginEnabled } from '../shared/auth-mode.util';
import { getDemoLoginCredentials, isVpsPostgresMode, matchVpsLogin } from '../shared/vps-postgres.util';

function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: cookieSecureFlag(),
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSec * 1000,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtTokenService,
    private readonly sessions: SessionService,
    private readonly users: AuthUserResolver,
    private readonly audit: AuthAuditService,
    private readonly rateLimiter: AuthRateLimiterService,
    private readonly lockout: AuthAccountLockoutService,
    private readonly csrf: CsrfService,
    private readonly suspicious: SuspiciousLoginService,
    private readonly supabaseJwt: SupabaseJwtService,
  ) {}

  idleTimeoutMs(roles: string[]): number {
    return this.sessions.idleTimeoutMsForRoles(roles);
  }

  toMeDto(user: ResolvedAppUser, sessionMeta?: AuthSessionMetaDto): AuthMeDto {
    return {
      publicId: encodeUserPublicId(user.id),
      username: user.username,
      email: user.email,
      roles: user.roles,
      assignments: (user.assignments ?? []).map((a) => ({
        roleName: a.roleName,
        assignedScopes: Array.isArray(a.assignedScopes) ? a.assignedScopes : [],
      })),
      idleTimeoutMs: this.idleTimeoutMs(user.roles),
      session: sessionMeta,
    };
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(ACCESS_TOKEN_TTL_SEC));
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_TOKEN_TTL_SEC));
    const csrfToken = this.csrf.generateToken();
    this.csrf.setCsrfCookie(res, csrfToken, REFRESH_TOKEN_TTL_SEC);
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    this.csrf.clearCsrfCookie(res);
  }

  private accessExpiresAtFromToken(accessToken: string): number {
    try {
      const payload = this.jwt.verifyAccess(accessToken);
      if (payload.exp) return payload.exp * 1000;
    } catch {
      /* fallback */
    }
    return Date.now() + ACCESS_TOKEN_TTL_SEC * 1000;
  }

  private async buildSessionMeta(
    sessionId: string,
    user: ResolvedAppUser,
    accessToken: string,
  ): Promise<AuthSessionMetaDto | undefined> {
    const accessExpiresAt = this.accessExpiresAtFromToken(accessToken);
    const meta = await this.sessions.getSessionMeta(
      sessionId,
      user.id,
      user.roles,
      accessExpiresAt,
    );
    return meta ?? undefined;
  }

  /**
   * Preferred login: browser verified password with Supabase; exchange JWT for backend session.
   */
  async exchange(
    supabaseAccessToken: string,
    res: Response,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthMeDto> {
    const token = supabaseAccessToken?.trim();
    if (!token) {
      throw new UnauthorizedException('Missing Supabase access token');
    }

    await this.rateLimiter.assertAllowed('exchange', meta?.ip ?? 'unknown');

    let claims;
    try {
      claims = await this.supabaseJwt.verifyAccessToken(token);
    } catch {
      await this.lockout.recordFailure(this.lockout.buildIdentifier('unknown', meta?.ip));
      throw new UnauthorizedException('Invalid or expired token');
    }

    const lockId = this.lockout.buildIdentifier(claims.email ?? claims.sub, meta?.ip);
    await this.lockout.assertNotLocked(lockId);

    if (!emailDomainAllowed(claims.email)) {
      await this.lockout.recordFailure(lockId);
      throw new UnauthorizedException(
        'Akun email tidak diizinkan. Gunakan akun Microsoft Siloam Hospitals (@siloamhospitals.com).',
      );
    }

    let appUser: ResolvedAppUser;
    try {
      // Use the caller's Supabase JWT during exchange so user resolution can
      // still work under RLS even when service-role env is unavailable.
      const client = this.users.createAnonClient(token);
      appUser = await this.users.resolveAppUserByAuthId(
        client,
        claims.sub,
        claims.email,
      );
    } catch (e) {
      if (isTlsFetchError(e)) {
        throw new ServiceUnavailableException(
          'Server cannot reach database (TLS). Set SUPABASE_CA_CERT_PATH or install win-ca.',
        );
      }
      await this.lockout.recordFailure(lockId);
      throw new UnauthorizedException('Account not authorized for this application');
    }

    await this.lockout.clearFailures(lockId);

    return this.establishSession(appUser, claims.sub, res, {
      email: appUser.email,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
  }

  private async establishSession(
    appUser: ResolvedAppUser,
    authId: string,
    res: Response,
    meta?: { email?: string; ip?: string | null; userAgent?: string | null },
  ): Promise<AuthMeDto> {
    const suspiciousResult = await this.suspicious.evaluate({
      userId: appUser.id,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    let stored;
    let accessToken: string;
    try {
      const { raw: refreshRaw, hash, expiresAt } = this.jwt.createRefreshToken();
      stored = await this.sessions.createSession({
        userId: appUser.id,
        authId,
        refreshRaw,
        refreshHash: hash,
        expiresAt,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      });

      accessToken = this.jwt.signAccess({
        sub: appUser.id,
        authId,
        sid: stored.id,
        roles: appUser.roles,
      });

      this.setAuthCookies(res, accessToken, refreshRaw);
    } catch (e) {
      if (isTlsFetchError(e)) {
        throw new ServiceUnavailableException(
          'Could not create session (TLS). Run auth_sessions migration and configure SUPABASE_CA_CERT_PATH if needed.',
        );
      }
      throw e;
    }

    await this.audit.logLogin({
      userId: appUser.id,
      authId,
      email: meta?.email ?? appUser.email,
      success: true,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      eventType: 'login',
      isSuspicious: suspiciousResult.suspicious,
      metadata: suspiciousResult.reasons.length
        ? { reasons: suspiciousResult.reasons }
        : undefined,
    });

    const sessionMeta = await this.buildSessionMeta(stored.id, appUser, accessToken);
    return this.toMeDto(appUser, sessionMeta);
  }

  /** Legacy: password login on server (may fail TLS on locked-down Windows networks). */
  async login(
    email: string,
    password: string,
    res: Response,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthMeDto> {
    if (isVpsPostgresMode()) {
      return this.loginVpsDummy(email, password, res, meta);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const lockId = this.lockout.buildIdentifier(normalizedEmail, meta?.ip);
    await this.lockout.assertNotLocked(lockId);
    await this.rateLimiter.assertAllowed('login', lockId);

    const anon = this.users.createAnonClient();
    let data: Awaited<ReturnType<typeof anon.auth.signInWithPassword>>['data'];
    let error: Awaited<ReturnType<typeof anon.auth.signInWithPassword>>['error'];
    try {
      const result = await anon.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      data = result.data;
      error = result.error;
    } catch (e) {
      if (isTlsFetchError(e)) {
        throw new ServiceUnavailableException(
          'Auth API unreachable from server (TLS). Use browser login (exchange) or set SUPABASE_CA_CERT_PATH.',
        );
      }
      throw e;
    }

    if (error || !data?.session?.access_token || !data.user) {
      await this.lockout.recordFailure(lockId);
      await this.audit.logLogin({
        email,
        success: false,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
        eventType: 'login_failed',
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    let appUser: ResolvedAppUser;
    try {
      appUser = await this.users.resolveAppUserByAuthId(
        anon,
        data.user.id,
        data.user.email,
      );
    } catch {
      await this.lockout.recordFailure(lockId);
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.lockout.clearFailures(lockId);
    return this.establishSession(appUser, data.user.id, res, {
      email,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
  }

  /** VPS Postgres — no GoTrue; password allowlist (demo + InfoSec env accounts). */
  private async loginVpsDummy(
    email: string,
    password: string,
    res: Response,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthMeDto> {
    const matchedEmail = matchVpsLogin(email, password);
    if (!matchedEmail) {
      const demo = getDemoLoginCredentials();
      throw new UnauthorizedException(
        `Invalid email or password (VPS: ${demo.email} or InfoSec accounts from env)`,
      );
    }

    const client = this.users.createServiceReadClient();
    const appUser = await this.users.resolveAppUserByEmail(client, matchedEmail);
    const authId =
      appUser.auth_id?.trim() ||
      `11111111-1111-1111-1111-${String(appUser.id).padStart(12, '0').slice(-12)}`;

    return this.establishSession(appUser, authId, res, {
      email: matchedEmail,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
  }

  async refresh(
    refreshRaw: string | undefined,
    res: Response,
    meta?: { ip?: string },
  ): Promise<AuthMeDto> {
    if (!refreshRaw?.trim()) {
      throw new UnauthorizedException('Missing refresh token');
    }

    await this.rateLimiter.assertAllowed('refresh', meta?.ip ?? 'unknown');

    const session = await this.sessions.findValidSession(refreshRaw.trim());
    const anon = this.users.createAnonClient();
    const appUser = await this.users.resolveAppUserByAuthId(anon, session.authId);

    const idleMs = this.idleTimeoutMs(appUser.roles);
    this.sessions.assertNotIdle(session.lastActiveAt, idleMs);

    const { raw: newRaw, hash, expiresAt } = this.jwt.createRefreshToken();
    const rotated = await this.sessions.rotateSession(
      session,
      refreshRaw.trim(),
      newRaw,
      hash,
      expiresAt,
    );

    const accessToken = this.jwt.signAccess({
      sub: appUser.id,
      authId: session.authId,
      sid: rotated.id,
      roles: appUser.roles,
    });

    this.setAuthCookies(res, accessToken, newRaw);
    await this.sessions.touchSession(rotated.id);

    await this.audit.logLogin({
      userId: appUser.id,
      authId: session.authId,
      email: appUser.email,
      success: true,
      ip: meta?.ip,
      eventType: 'token_refresh',
    });

    const sessionMeta = await this.buildSessionMeta(rotated.id, appUser, accessToken);
    return this.toMeDto(appUser, sessionMeta);
  }

  async me(accessToken: string | undefined): Promise<AuthMeDto | null> {
    if (!accessToken?.trim()) return null;
    try {
      const payload = this.jwt.verifyAccess(accessToken.trim());
      if (payload.sid) {
        const active = await this.sessions.assertSessionActive(
          payload.sid,
          payload.sub,
        );
        if (!active) return null;
      }
      const anon = this.users.createAnonClient();
      const appUser = await this.users.resolveAppUserByAuthId(
        anon,
        payload.authId,
      );

      const sessionMeta = payload.sid
        ? await this.buildSessionMeta(payload.sid, appUser, accessToken.trim())
        : undefined;

      return this.toMeDto(appUser, sessionMeta);
    } catch {
      return null;
    }
  }

  async logout(
    accessToken: string | undefined,
    refreshRaw: string | undefined,
    res: Response,
    meta?: {
      ip?: string;
      userAgent?: string;
      allDevices?: boolean;
    },
  ): Promise<void> {
    try {
      if (accessToken?.trim()) {
        const payload = this.jwt.verifyAccess(accessToken.trim());
        if (payload.sid) {
          await this.sessions.revokeSession(payload.sid);
        }
        if (meta?.allDevices) {
          await this.sessions.revokeAllForUser(payload.sub);
        }
        await this.audit.logSessionEvent({
          userId: payload.sub,
          success: true,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          eventType: 'logout',
        });
      } else if (refreshRaw?.trim()) {
        const session = await this.sessions.findValidSession(refreshRaw.trim());
        await this.sessions.revokeSession(session.id);
        if (meta?.allDevices) {
          await this.sessions.revokeAllForUser(session.userId);
        }
      }
    } catch {
      /* best-effort */
    }
    this.clearAuthCookies(res);
  }

  async heartbeat(
    accessToken: string | undefined,
    meta?: { ip?: string },
  ): Promise<{ ok: boolean }> {
    if (!accessToken?.trim()) return { ok: false };

    await this.rateLimiter.assertAllowed('heartbeat', meta?.ip ?? 'unknown');

    try {
      const payload = this.jwt.verifyAccess(accessToken.trim());
      if (payload.sid) {
        await this.sessions.touchSession(payload.sid);
      }
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Change password for the authenticated app user (verifies current password server-side).
   */
  async changePassword(
    accessToken: string,
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    const current = String(currentPassword ?? '');
    const next = String(newPassword ?? '');
    if (!current || current.length > 256) {
      throw new BadRequestException('Password saat ini tidak valid.');
    }
    if (!next || next.length < 6 || next.length > 256) {
      throw new BadRequestException('Password baru minimal 6 karakter.');
    }

    const payload = this.jwt.verifyAccess(accessToken);
    const anon = this.users.createAnonClient(accessToken);
    const appUser = await this.users.resolveAppUserByAuthId(anon, payload.authId);
    if (Number(appUser.id) !== Number(userId)) {
      throw new UnauthorizedException('Invalid session user');
    }

    const email = String(appUser.email ?? '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Email akun tidak ditemukan.');

    const verifyClient = this.users.createAnonClient();
    const { error: verifyErr } = await verifyClient.auth.signInWithPassword({
      email,
      password: current,
    });
    if (verifyErr) {
      throw new UnauthorizedException('Password saat ini salah.');
    }

    const authId = String(appUser.auth_id ?? '').trim();
    if (!authId) {
      throw new BadRequestException('Akun belum terhubung ke auth. Hubungi admin.');
    }

    const serviceKey = getSupabaseServiceKey();
    if (!serviceKey) {
      throw new ServiceUnavailableException('Auth admin not configured');
    }
    const admin = createSupabaseClient(serviceKey);
    const { error: updateErr } = await admin.auth.admin.updateUserById(authId, {
      password: next,
    });
    if (updateErr) {
      throw new BadRequestException(updateErr.message || 'Gagal mengubah password.');
    }

    return { ok: true };
  }

  /**
   * Request password reset email via Supabase Auth (default Supabase mailer).
   * Always returns a generic success message to avoid email enumeration.
   */
  async forgotPassword(
    email: string,
    redirectTo: string | undefined,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<{ ok: true; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    await this.rateLimiter.assertAllowed(
      'forgot_password',
      `${normalizedEmail}:${meta?.ip ?? 'unknown'}`,
    );

    const safeRedirect = this.resolvePasswordResetRedirect(redirectTo);
    const anon = this.users.createAnonClient();

    try {
      const { error } = await anon.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: safeRedirect,
      });

      await this.audit.logLogin({
        email: normalizedEmail,
        success: !error,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
        eventType: 'password_reset_request',
        metadata: error ? { reason: error.message, status: error.status } : undefined,
      });

      if (error) {
        this.throwForgotPasswordError(error);
      }
    } catch (e) {
      if (isTlsFetchError(e)) {
        throw new ServiceUnavailableException(
          'Auth API unreachable from server (TLS). Set SUPABASE_CA_CERT_PATH or use browser reset.',
        );
      }
      throw e;
    }

    return {
      ok: true,
      message:
        'Jika email terdaftar, Anda akan menerima link reset password dari Supabase.',
    };
  }

  private throwForgotPasswordError(error: { message?: string; status?: number }): never {
    const msg = (error.message ?? '').toLowerCase();
    if (error.status === 429 || msg.includes('rate limit')) {
      throw new HttpException(
        'Terlalu banyak permintaan email reset. Mailer default Supabase dibatasi (~2 email/jam). Tunggu ±1 jam lalu coba lagi, atau naikkan limit di Supabase Dashboard → Authentication → Rate Limits.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (msg.includes('not authorized')) {
      throw new HttpException(
        'Email belum diizinkan menerima email dari mailer default Supabase. Tambahkan alamat ini ke tim Supabase org, atau aktifkan Custom SMTP.',
        HttpStatus.BAD_REQUEST,
      );
    }
    throw new ServiceUnavailableException(
      'Gagal mengirim email reset password. Coba lagi nanti.',
    );
  }

  private resolvePasswordResetRedirect(clientRedirect?: string): string {
    const allowedOrigins = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean);
    const fallbackOrigin = allowedOrigins[0] || DEV_LOCAL_ORIGIN;
    const fallback = `${fallbackOrigin}/`;

    if (!clientRedirect?.trim()) return fallback;

    try {
      const url = new URL(clientRedirect.trim());
      const origin = url.origin;
      if (allowedOrigins.some((allowed) => allowed === origin)) {
        return clientRedirect.trim();
      }
    } catch {
      /* invalid URL */
    }

    return fallback;
  }

  private frontendOrigin(): string {
    const explicit = process.env.FRONTEND_URL?.trim().replace(/\/$/, '');
    if (explicit) return explicit;
    const cors = (process.env.CORS_ORIGINS || '')
      .split(',')[0]
      ?.trim()
      .replace(/\/$/, '');
    return cors || DEV_LOCAL_ORIGIN;
  }

  private oauthCallbackUrl(): string {
    const path = (process.env.OAUTH_CALLBACK_PATH || '/api/auth/azure/callback').trim();
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${this.frontendOrigin()}${normalized}`;
  }

  sanitizeOAuthReturnTo(raw?: string): string {
    const v = (raw || '/').trim();
    if (!v.startsWith('/') || v.startsWith('//')) return '/';
    if (v.includes('://')) return '/';
    return v;
  }

  private oauthCookieOpts(maxAgeSec: number) {
    // Lax: Microsoft → Capex callback is cross-site top-level; Strict drops PKCE cookies.
    return {
      httpOnly: true,
      secure: cookieSecureFlag(),
      sameSite: 'lax' as const,
      path: '/',
      maxAge: maxAgeSec * 1000,
    };
  }

  /**
   * Direct Azure Entra OAuth (no Supabase Auth broker).
   * Browser → Microsoft → Capex callback → Capex session cookies.
   */
  startAzureOAuth(returnToRaw: string | undefined, res: Response): string {
    if (!isSsoLoginEnabled()) {
      throw new ServiceUnavailableException('SSO is disabled (CAPEX_AUTH_MODE)');
    }
    const azure = getAzureOAuthConfig();
    if (!azure) {
      throw new ServiceUnavailableException(
        'Azure SSO not configured — set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET',
      );
    }

    const returnTo = this.sanitizeOAuthReturnTo(returnToRaw);
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const callbackUrl = this.oauthCallbackUrl();

    res.cookie(OAUTH_PKCE_COOKIE, verifier, this.oauthCookieOpts(OAUTH_COOKIE_TTL_SEC));
    res.cookie(OAUTH_RETURN_COOKIE, returnTo, this.oauthCookieOpts(OAUTH_COOKIE_TTL_SEC));

    return azureAuthorizeUrl(azure, { redirectUri: callbackUrl, codeChallenge: challenge });
  }

  humanizeOAuthError(raw: string): string {
    const msg = decodeURIComponent(raw).toLowerCase();
    if (
      msg.includes('redirect_uri') ||
      msg.includes('aadi') ||
      msg.includes('invalid_client') ||
      msg.includes('unauthorized_client')
    ) {
      return (
        'Konfigurasi Azure belum benar. Periksa Redirect URI di Azure App (harus sama dengan Capex callback) dan Client Secret.'
      );
    }
    if (msg.includes('error getting user email') || msg.includes('did not return an email')) {
      return 'Microsoft tidak mengirim email. Pastikan scope email aktif di Azure App.';
    }
    if (msg.includes('access_denied')) {
      return 'Login Microsoft dibatalkan atau akun tidak diizinkan.';
    }
    return raw;
  }

  /** Exchange Azure auth code → email → Capex session (no Supabase Auth). */
  async completeAzureOAuth(
    code: string | undefined,
    pkceVerifier: string | undefined,
    returnToRaw: string | undefined,
    oauthError: string | undefined,
    oauthErrorDescription: string | undefined,
    res: Response,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<string> {
    const returnTo = this.sanitizeOAuthReturnTo(returnToRaw);
    const frontend = this.frontendOrigin();

    res.clearCookie(OAUTH_PKCE_COOKIE, { path: '/' });
    res.clearCookie(OAUTH_RETURN_COOKIE, { path: '/' });

    const failRedirect = (message: string) => {
      const q = returnTo.includes('?') ? '&' : '?';
      return `${frontend}${returnTo}${q}oauth_error=${encodeURIComponent(this.humanizeOAuthError(message))}`;
    };

    if (oauthError?.trim()) {
      const detail = oauthErrorDescription?.trim() || oauthError.trim();
      return failRedirect(detail);
    }

    if (!code?.trim()) {
      return failRedirect('Login Microsoft dibatalkan atau kode OAuth tidak diterima.');
    }
    if (!pkceVerifier?.trim()) {
      return failRedirect('Sesi OAuth kedaluwarsa. Coba login lagi.');
    }

    const azure = getAzureOAuthConfig();
    if (!azure) {
      return failRedirect('Azure SSO belum dikonfigurasi di server.');
    }

    const callbackUrl = this.oauthCallbackUrl();
    let email: string;
    try {
      const tokens = await exchangeAzureAuthCode(azure, {
        code: code.trim(),
        codeVerifier: pkceVerifier.trim(),
        redirectUri: callbackUrl,
      });
      email = emailFromAzureIdToken(tokens.idToken, azure);
    } catch (e) {
      return failRedirect(e instanceof Error ? e.message : 'Gagal menukar kode OAuth Azure.');
    }

    if (!emailDomainAllowed(email)) {
      return failRedirect(
        'Akun email tidak diizinkan. Gunakan akun Microsoft Siloam Hospitals (@siloamhospitals.com).',
      );
    }

    try {
      await this.rateLimiter.assertAllowed('exchange', meta?.ip ?? 'unknown');
      const client = this.users.createServiceReadClient();
      const appUser = await this.users.resolveAppUserByEmail(client, email);
      const authId = appUser.auth_id?.trim() || azureAuthIdForEmail(email);
      await this.establishSession(appUser, authId, res, {
        email,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      });
    } catch (e) {
      const message =
        e instanceof UnauthorizedException
          ? 'Akun Microsoft Anda tidak terdaftar di Capex Pro atau tidak memiliki akses. Hubungi admin.'
          : e instanceof Error
            ? e.message
            : 'Login Microsoft gagal.';
      return failRedirect(message);
    }

    return `${frontend}${returnTo}`;
  }
}
