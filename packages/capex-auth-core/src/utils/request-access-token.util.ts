import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ACCESS_COOKIE } from '../constants/auth-policy';
import { parseCookies } from './cookie.util';
import { resolveUserPublicIdParam } from '../../../capexbe/src/shared/public-id.util';
import type { ResolvedAuthContext } from '../types/resolved-auth-context';

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

export function parseBodyUserId(req: Request): number | undefined {
  const body = req.body as { publicUserId?: string } | undefined;
  if (body?.publicUserId != null && String(body.publicUserId).trim()) {
    const decoded = resolveUserPublicIdParam(body.publicUserId);
    if (decoded) return decoded;
  }
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
