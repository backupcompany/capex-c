import Hashids from 'hashids';
import { BadRequestException } from '@nestjs/common';
import { getAuthRequestContext } from '../auth/auth-request-context';

/** Rotated after client salt exposure (cyber finding). Override via PUBLIC_ID_SALT in prod. */
const DEFAULT_SALT = 'capex-siloam-public-id-v2';
const MIN_LENGTH = 8;

let codec: Hashids | null = null;

function getCodec(): Hashids {
  if (!codec) {
    // Server-only — never read NEXT_PUBLIC_* (would encourage client bundling of the salt).
    const salt = process.env.PUBLIC_ID_SALT?.trim() || DEFAULT_SALT;
    codec = new Hashids(salt, MIN_LENGTH);
  }
  return codec;
}

/** Mask numeric user id for API/UI egress — DB queries stay on integer id. */
export function encodeUserPublicId(userId: number): string {
  if (!Number.isFinite(userId) || userId <= 0) return '';
  return getCodec().encode(userId);
}

export function decodeUserPublicId(token: string): number | null {
  const trimmed = String(token ?? '').trim();
  if (!trimmed) return null;
  const decoded = getCodec().decode(trimmed);
  if (decoded.length !== 1) return null;
  const id = Number(decoded[0]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Accept legacy numeric string or Hashids token. */
export function resolveUserPublicIdParam(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return decodeUserPublicId(raw);
}

/** Resolve actor user id from request body (after publicUserId interceptor or wire token). */
export function resolveBodyActorUserId(body: unknown): number {
  const b = (body ?? {}) as Record<string, unknown>;
  const internal = Number(b.userId);
  if (Number.isFinite(internal) && internal > 0) return internal;
  const fromPublic = resolveUserPublicIdParam(b.publicUserId);
  if (fromPublic) return fromPublic;
  const ctx = getAuthRequestContext();
  const fromJwt = Number(ctx?.userId);
  if (Number.isFinite(fromJwt) && fromJwt > 0) return fromJwt;
  throw new BadRequestException('Invalid publicUserId');
}
