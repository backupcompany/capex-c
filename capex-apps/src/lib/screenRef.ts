/** Opaque screen deep-link refs — hide raw resource ids in query strings. */

export type ScreenRefKind = 'fs' | 'project' | 'asset';

function toBase64Url(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64url');
  }
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): string | null {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(token, 'base64url').toString('utf8');
    }
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeScreenRef(kind: ScreenRefKind, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return toBase64Url(`${kind}:${trimmed}`);
}

export function decodeScreenRef(token: string): { kind: ScreenRefKind; value: string } | null {
  const raw = fromBase64Url(token.trim());
  if (!raw) return null;
  const sep = raw.indexOf(':');
  if (sep <= 0) return null;
  const kind = raw.slice(0, sep) as ScreenRefKind;
  const value = raw.slice(sep + 1).trim();
  if (!value) return null;
  if (kind !== 'fs' && kind !== 'project' && kind !== 'asset') return null;
  return { kind, value };
}

export function buildFsApprovalDeepLink(fsId: string): string {
  const ref = encodeScreenRef('fs', fsId);
  return ref ? `/fs-approval?ref=${encodeURIComponent(ref)}` : '/fs-approval';
}

/** Read deep-link focus from URL — supports opaque `ref` and legacy `fsId`. */
export function readFsApprovalFocusFromSearchParams(params: URLSearchParams): string | null {
  const ref = params.get('ref')?.trim();
  if (ref) {
    const decoded = decodeScreenRef(ref);
    if (decoded?.kind === 'fs') return decoded.value;
  }
  const legacy = params.get('fsId')?.trim();
  return legacy || null;
}

export function stripDeepLinkParamsFromUrl(pathname: string, search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete('ref');
  params.delete('fsId');
  params.delete('focus');
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
