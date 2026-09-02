/**
 * PostgREST / Supabase query filter hardening.
 * Prevents filter-grammar injection in `.or('col.op.val,...')` and ILIKE wildcard abuse.
 * Values passed to `.eq()` / `.ilike(col, pat)` two-arg forms are already parameterized by PostgREST.
 */

export const MAX_SEARCH_TERM_LENGTH = 200;

/** Strip control chars; cap length — apply to all user search terms before query build. */
export function sanitizePostgrestSearchTerm(term: string): string {
  return String(term ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_SEARCH_TERM_LENGTH);
}

/** Escape `%` / `_` / `\` for ILIKE pattern values. */
export function escapeIlikePattern(term: string): string {
  return term.replace(/[%_\\]/g, '\\$&');
}

/** Commas break PostgREST `.or()` — strip before building filter expressions. */
export function sanitizeSearchForOrFilter(term: string): string {
  return escapeIlikePattern(sanitizePostgrestSearchTerm(term).replace(/,/g, ' '));
}

/** ILIKE pattern for `.ilike('col', pattern)` (two-arg — safe for dots in value). */
export function sqlIlikePattern(term: string): string {
  const core = sanitizeSearchForOrFilter(term);
  if (!core) return '%';
  return `%${core}%`;
}

/** Case-insensitive equality for `.ilike('col', pattern)` (no `%` / `_` wildcards). */
export function sqlIlikeExactPattern(term: string): string {
  // Do NOT use sanitizeSearchForOrFilter — that turns commas into spaces (breaks asset codes).
  return escapeIlikePattern(sanitizePostgrestSearchTerm(term));
}

/**
 * Code variants for typo tolerance: AIDO.26.00,001 ↔ AIDO.26.00.001
 * (comma / dot interchangeable; keep original too).
 */
export function projectListAssetCodeSearchVariants(term: string): string[] {
  const raw = sanitizePostgrestSearchTerm(term);
  if (!raw) return [];
  const asDots = raw.replace(/,/g, '.');
  const asCommas = raw.replace(/\./g, ',');
  return [...new Set([raw, asDots, asCommas])];
}

/** Compact key for client-side similarity: strips separators. */
export function normalizeProjectListAssetCodeKey(code: string): string {
  return sanitizePostgrestSearchTerm(code).toLowerCase().replace(/[\s.,_-]+/g, '');
}

/**
 * ILIKE value for PostgREST `.or('col.ilike.…')` string filters.
 * Dots/commas in asset codes are reserved in `.or()` unless quoted.
 */
export function postgrestOrIlikeFilterValue(term: string): string {
  const inner = sanitizeSearchForOrFilter(term);
  const pattern = `*${inner}*`;
  const escaped = pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/** Build safe `.or()` ILIKE clause for fixed column names only (never user-supplied column names). */
export function buildSafeOrIlikeFilter(columns: readonly string[], searchTerm: string): string | null {
  const term = sanitizePostgrestSearchTerm(searchTerm);
  if (!term || columns.length === 0) return null;
  const v = postgrestOrIlikeFilterValue(term);
  return columns.map((col) => `${col}.ilike.${v}`).join(',');
}

/** IDs embedded in PostgREST `.in.(a,b)` filter strings — alphanumeric + hyphen/underscore/dot. */
const SAFE_POSTGREST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function sanitizePostgrestIdList(ids: string[]): string[] {
  return [...new Set(ids.map((id) => String(id).trim()))].filter((id) => SAFE_POSTGREST_ID.test(id));
}

/** Quote ids for PostgREST `.in.()` / `.or()` string filters (dots are reserved otherwise). */
export function formatPostgrestInList(ids: string[]): string {
  return sanitizePostgrestIdList(ids)
    .map((id) => `"${id.replace(/"/g, '')}"`)
    .join(',');
}

/** @deprecated use postgrestOrIlikeFilterValue */
export function postgrestOrIlikePattern(term: string): string {
  return postgrestOrIlikeFilterValue(term);
}
