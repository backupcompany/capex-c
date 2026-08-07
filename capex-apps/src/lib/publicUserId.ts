import Hashids from 'hashids';

const DEFAULT_SALT = 'capex-siloam-public-id-v1';
const MIN_LENGTH = 8;

let codec: Hashids | null = null;

function getCodec(): Hashids {
  if (!codec) {
    const salt =
      (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_PUBLIC_ID_SALT : undefined)?.trim() ||
      DEFAULT_SALT;
    codec = new Hashids(salt, MIN_LENGTH);
  }
  return codec;
}

/** Mask numeric user id for UI/URL — DB & API tetap pakai angka. */
export function encodeUserPublicId(userId: number): string {
  if (!Number.isFinite(userId) || userId <= 0) return '';
  return getCodec().encode(userId);
}

export function decodeUserPublicId(token: string | null | undefined): number | null {
  const trimmed = String(token ?? '').trim();
  if (!trimmed) return null;
  const decoded = getCodec().decode(trimmed);
  if (decoded.length !== 1) return null;
  const id = Number(decoded[0]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function formatUserPublicId(userId: number): string {
  const encoded = encodeUserPublicId(userId);
  return encoded || '—';
}

if (process.env.NODE_ENV !== 'production') {
  const sample = encodeUserPublicId(148);
  const roundTrip = decodeUserPublicId(sample);
  if (roundTrip !== 148) {
    throw new Error(`publicUserId round-trip failed: ${sample} -> ${roundTrip}`);
  }
}
