/** Canonical entry — login UI + post-auth shell share `/`. */
export const LOGIN_PATH = '/' as const;

/** Default landing after successful authentication. */
export const POST_LOGIN_PATH = '/' as const;

/** Legacy `/login` — redirect to `/` in middleware. */
export const LEGACY_LOGIN_PATH = '/login' as const;

export function normalizeAppPath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function isLoginPath(pathname: string): boolean {
  return normalizeAppPath(pathname) === LOGIN_PATH;
}

export function loginUrlWithSuffix(hashOrSearch: string): string {
  if (!hashOrSearch) return LOGIN_PATH;
  return `${LOGIN_PATH}${hashOrSearch.startsWith('#') || hashOrSearch.startsWith('?') ? hashOrSearch : `?${hashOrSearch}`}`;
}
