import { AsyncLocalStorage } from 'async_hooks';
import type { ResolvedAuthContext } from './auth.types';

/** Per-request auth context — set by JwtAuthGuard / interceptor; avoids triple resolve. */
export const authRequestContext = new AsyncLocalStorage<ResolvedAuthContext>();

export function getAuthRequestContext(): ResolvedAuthContext | undefined {
  return authRequestContext.getStore();
}
