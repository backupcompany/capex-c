/** Email: no whitespace (paste/newline from spreadsheet). */
export function normalizeAuthEmail(raw: string): string {
  return raw.replace(/\s+/g, '').toLowerCase();
}

/** Password: strip accidental newlines; trim edges only (keep interior spaces). */
export function normalizeAuthPassword(raw: string): string {
  return raw.replace(/[\r\n\u2028\u2029]+/g, '').trim();
}
