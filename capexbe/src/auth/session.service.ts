import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JwtTokenService } from './jwt-token.service';
import {
  ABSOLUTE_SESSION_MS,
  IDLE_TIMEOUT_SENSITIVE_MS,
  IDLE_TIMEOUT_STANDARD_MS,
  SENSITIVE_ROLE_SLUGS,
} from './auth.constants';
import { isUuid } from './azure-oauth.util';
import {
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';

export type StoredSession = {
  id: string;
  userId: number;
  authId: string;
  familyId: string;
  lastActiveAt?: Date;
  familyStartedAt?: Date;
};

/** Safe PostgREST/supabase error summary (no tokens/keys). */
export function formatPostgrestError(error: unknown): string {
  if (error == null) return 'null';
  if (typeof error !== 'object') return String(error);
  const e = error as Record<string, unknown>;
  const parts = [
    e.message != null && e.message !== '' ? `message=${String(e.message)}` : null,
    e.code != null && e.code !== '' ? `code=${String(e.code)}` : null,
    e.details != null && e.details !== '' ? `details=${String(e.details)}` : null,
    e.hint != null && e.hint !== '' ? `hint=${String(e.hint)}` : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(' ');
  try {
    return `json=${JSON.stringify(error)}`;
  } catch {
    return `keys=${Object.keys(e).join(',') || '(empty)'}`;
  }
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  private adminClient(): SupabaseClient {
    const key = getSupabaseServiceKey();
    if (!key) {
      // Infra misconfig — must not look like "user not registered".
      throw new ServiceUnavailableException('Database not configured (SUPABASE_SERVICE_ROLE_KEY)');
    }
    return createSupabaseClient(key);
  }

  async createSession(params: {
    userId: number;
    authId: string;
    refreshRaw: string;
    refreshHash: string;
    expiresAt: Date;
    familyId?: string;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<StoredSession> {
    if (!isUuid(params.authId)) {
      throw new ServiceUnavailableException(
        `Could not create session: auth_id is not a UUID (${params.authId?.slice(0, 24) ?? 'empty'})`,
      );
    }
    const id = randomUUID();
    const familyId = params.familyId ?? randomUUID();
    const expiresAtIso = params.expiresAt.toISOString();
    const lastActiveAtIso = new Date().toISOString();

    // Safe metadata only — never log refreshRaw / service keys.
    this.logger.warn(
      JSON.stringify({
        tag: 'auth_sessions_insert_probe',
        userId: params.userId,
        authId: params.authId,
        authIdIsUuid: true,
        sessionId: id,
        familyId,
        familyIdIsUuid: isUuid(familyId),
        expiresAt: expiresAtIso,
        hashLen: params.refreshHash?.length ?? 0,
        hasUserAgent: Boolean(params.userAgent && String(params.userAgent).length > 0),
        hasIp: Boolean(params.ip && String(params.ip).length > 0),
      }),
    );

    const client = this.adminClient();
    // Prefer return=representation (matches working VM curl probe). Bare insert
    // (return=minimal) against self-hosted PostgREST/nginx can yield a truthy
    // empty error object → code=? msg=undefined while login looks failed.
    const { data, error, status, statusText } = await client
      .from('auth_sessions')
      .insert({
        id,
        user_id: params.userId,
        auth_id: params.authId,
        refresh_token_hash: params.refreshHash,
        family_id: familyId,
        expires_at: expiresAtIso,
        ip_address: params.ip ?? null,
        user_agent: params.userAgent ?? null,
        last_active_at: lastActiveAtIso,
      })
      .select('id')
      .single();

    const rowId =
      data && typeof data === 'object' ? String((data as { id?: string }).id ?? '') : '';
    if (rowId) {
      return { id: rowId, userId: params.userId, authId: params.authId, familyId };
    }

    this.logger.error(
      JSON.stringify({
        tag: 'auth_sessions_insert_failed',
        userId: params.userId,
        authId: params.authId,
        httpStatus: status ?? null,
        statusText: statusText ?? null,
        errorSummary: formatPostgrestError(error),
        errorJson: (() => {
          try {
            return JSON.stringify(error);
          } catch {
            return String(error);
          }
        })(),
        errorKeys: error && typeof error === 'object' ? Object.keys(error as object) : [],
      }),
    );
    throw new ServiceUnavailableException(
      `Could not create session: ${formatPostgrestError(error) || `HTTP ${status ?? '?'}`}`,
    );
  }

  async findValidSession(refreshRaw: string): Promise<StoredSession & { refreshHash: string }> {
    const hash = JwtTokenService.hashToken(refreshRaw);
    const client = this.adminClient();
    const { data, error } = await client
      .from('auth_sessions')
      .select('id, user_id, auth_id, family_id, expires_at, revoked_at, last_active_at, created_at')
      .eq('refresh_token_hash', hash)
      .maybeSingle();
    if (error || !data) {
      throw new UnauthorizedException('Invalid session');
    }
    if (data.revoked_at) {
      await this.revokeFamily(data.family_id as string);
      throw new UnauthorizedException('Session revoked');
    }
    const expiresAt = new Date(String(data.expires_at));
    if (expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired');
    }

    const familyStartedAt = await this.getFamilyStartedAt(String(data.family_id));
    if (familyStartedAt.getTime() + ABSOLUTE_SESSION_MS < Date.now()) {
      await this.revokeFamily(String(data.family_id));
      throw new UnauthorizedException('Absolute session expired');
    }

    return {
      id: String(data.id),
      userId: Number(data.user_id),
      authId: String(data.auth_id),
      familyId: String(data.family_id),
      refreshHash: hash,
      lastActiveAt: data.last_active_at ? new Date(String(data.last_active_at)) : undefined,
      familyStartedAt,
    };
  }

  async rotateSession(
    session: StoredSession,
    oldRefreshRaw: string,
    newRefreshRaw: string,
    newRefreshHash: string,
    newExpiresAt: Date,
  ): Promise<StoredSession> {
    const client = this.adminClient();
    const oldHash = JwtTokenService.hashToken(oldRefreshRaw);
    const { data: current } = await client
      .from('auth_sessions')
      .select('refresh_token_hash')
      .eq('id', session.id)
      .maybeSingle();
    if (!current || current.refresh_token_hash !== oldHash) {
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const familyStartedAt =
      session.familyStartedAt ?? (await this.getFamilyStartedAt(session.familyId));
    const absoluteCap = familyStartedAt.getTime() + ABSOLUTE_SESSION_MS;
    const cappedExpiresAt = new Date(
      Math.min(newExpiresAt.getTime(), absoluteCap),
    );
    if (cappedExpiresAt.getTime() <= Date.now()) {
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException('Absolute session expired');
    }

    const now = new Date().toISOString();
    await client
      .from('auth_sessions')
      .update({ revoked_at: now })
      .eq('id', session.id);
    return this.createSession({
      userId: session.userId,
      authId: session.authId,
      refreshRaw: newRefreshRaw,
      refreshHash: newRefreshHash,
      expiresAt: cappedExpiresAt,
      familyId: session.familyId,
    });
  }

  async touchSession(sessionId: string): Promise<void> {
    const client = this.adminClient();
    await client
      .from('auth_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', sessionId)
      .is('revoked_at', null);
  }

  async revokeSession(sessionId: string): Promise<void> {
    const client = this.adminClient();
    await client
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sessionId);
  }

  async revokeAllForUser(userId: number): Promise<void> {
    const client = this.adminClient();
    await client
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    const client = this.adminClient();
    await client
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('family_id', familyId)
      .is('revoked_at', null);
  }

  async assertSessionActive(sessionId: string, userId: number): Promise<boolean> {
    const client = this.adminClient();
    const { data } = await client
      .from('auth_sessions')
      .select('id, last_active_at, revoked_at, family_id, created_at')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data || data.revoked_at) return false;

    const familyStartedAt = await this.getFamilyStartedAt(String(data.family_id));
    if (familyStartedAt.getTime() + ABSOLUTE_SESSION_MS < Date.now()) {
      await this.revokeFamily(String(data.family_id));
      return false;
    }
    return true;
  }

  idleTimeoutMsForRoles(roles: string[]): number {
    const sensitive = roles.some((r) => SENSITIVE_ROLE_SLUGS.has(r));
    return sensitive ? IDLE_TIMEOUT_SENSITIVE_MS : IDLE_TIMEOUT_STANDARD_MS;
  }

  /** Reject if server-side idle timeout exceeded (sliding session). */
  assertNotIdle(lastActiveAt: Date | undefined, idleTimeoutMs: number): void {
    if (!lastActiveAt) return;
    if (Date.now() - lastActiveAt.getTime() > idleTimeoutMs) {
      throw new UnauthorizedException('Session idle timeout');
    }
  }

  async getSessionMeta(
    sessionId: string,
    userId: number,
    roles: string[],
    accessExpiresAt: number,
  ): Promise<{
    accessExpiresAt: number;
    absoluteExpiresAt: number;
    idleTimeoutMs: number;
  } | null> {
    const client = this.adminClient();
    const { data } = await client
      .from('auth_sessions')
      .select('family_id, last_active_at')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .maybeSingle();
    if (!data) return null;

    const familyStartedAt = await this.getFamilyStartedAt(String(data.family_id));
    return {
      accessExpiresAt,
      absoluteExpiresAt: familyStartedAt.getTime() + ABSOLUTE_SESSION_MS,
      idleTimeoutMs: this.idleTimeoutMsForRoles(roles),
    };
  }

  private async getFamilyStartedAt(familyId: string): Promise<Date> {
    const client = this.adminClient();
    const { data } = await client
      .from('auth_sessions')
      .select('created_at')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.created_at) {
      return new Date(String(data.created_at));
    }
    return new Date();
  }
}
