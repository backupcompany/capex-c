/** Correlation ID — set at edge middleware, forwarded BFF → leaf. */
export const REQUEST_ID_HEADER = 'X-Request-Id';

export function resolveRequestId(incoming?: string | null): string {
  const trimmed = incoming?.trim();
  if (trimmed) return trimmed;
  return crypto.randomUUID();
}
