/** Minimal snake_case → camelCase (shared pattern with notifications-core). */
export function toCamelCase(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj as object)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    out[camelKey] = toCamelCase((obj as Record<string, unknown>)[key]);
  }
  return out;
}
