/** Strip numeric userId from outbound API body — BE binds identity from JWT. */
export function redactOutgoingUserId(body: Record<string, unknown>): Record<string, unknown> {
  const { userId: _removed, publicUserId: _pub, ...rest } = body;
  return rest;
}

/** Redact userId inside a JSON request body string (BFF proxy / fetch). */
export function redactOutgoingUserIdJson(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return raw;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return JSON.stringify(redactOutgoingUserId(parsed as Record<string, unknown>));
    }
  } catch {
    /* leave body unchanged */
  }
  return raw;
}
