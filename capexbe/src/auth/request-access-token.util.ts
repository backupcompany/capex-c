import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ACCESS_COOKIE } from './auth.constants';
import { parseCookies } from './cookie.util';
import type { ResolvedAuthContext } from './auth.types';

/** Read backend access JWT from Authorization header or httpOnly cookie. */
export function getAccessTokenFromRequest(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[ACCESS_COOKIE]?.trim() || undefined;
}

export function requireAccessTokenFromRequest(req: Request): string {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    throw new UnauthorizedException('Authentication required');
  }
  return token;
}

/** JWT-only bind at guard — wire bodies no longer carry user identity. */
export function parseBodyUserId(_req: Request): number | undefined {
  return undefined;
}

/** Authenticated app user id from JwtAuthGuard — never trust raw body after guard. */
export function getCallerUserId(req: Request): number {
  const ctx = (req as Request & { authContext?: ResolvedAuthContext }).authContext;
  const uid = Number(ctx?.userId);
  if (!Number.isFinite(uid) || uid <= 0) {
    throw new UnauthorizedException('Authentication required');
  }
  return uid;
}

/** Merge JWT-bound userId into body for legacy parsers after FE redacts wire userId. */
export function bodyWithCallerUserId(req: Request, body: unknown): Record<string, unknown> {
  const base =
    body && typeof body === 'object' && !Array.isArray(body)
      ? { ...(body as Record<string, unknown>) }
      : {};
  base.userId = getCallerUserId(req);
  return base;
}
