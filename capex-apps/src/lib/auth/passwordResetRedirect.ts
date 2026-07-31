import { LOGIN_PATH } from './loginRoute';

/** Password reset email opens the login route — recovery hash is processed there. */
export function getPasswordResetRedirectUrl(): string {
  if (typeof window === 'undefined') return LOGIN_PATH;
  return `${window.location.origin}${LOGIN_PATH}`;
}
