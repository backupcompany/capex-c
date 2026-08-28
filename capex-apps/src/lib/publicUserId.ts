/**
 * Client-safe public id helpers — opaque strings from the API only.
 * Never encode/decode numeric ids in the browser.
 */

/** Display helper — never invent tokens on the client. */
export function formatUserPublicId(publicIdOrFallback?: string | null): string {
  const t = String(publicIdOrFallback ?? '').trim();
  return t || '—';
}

/** True if token looks like a non-empty opaque public id (not a bare integer). */
export function isOpaquePublicId(token: string | null | undefined): boolean {
  const t = String(token ?? '').trim();
  return t.length >= 4 && !/^\d+$/.test(t);
}
