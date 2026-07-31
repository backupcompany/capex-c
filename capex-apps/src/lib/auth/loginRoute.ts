/** Canonical login URL — keep middleware + client redirects in sync. */
export const LOGIN_PATH = '/login' as const;

/** Default landing after successful authentication. */
export const POST_LOGIN_PATH = '/' as const;

export function isLoginPath(pathname: string): boolean {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return trimmed === LOGIN_PATH;
}

export function loginUrlWithSuffix(hashOrSearch: string): string {
  if (!hashOrSearch) return LOGIN_PATH;
  return `${LOGIN_PATH}${hashOrSearch.startsWith('#') || hashOrSearch.startsWith('?') ? hashOrSearch : `?${hashOrSearch}`}`;
}
