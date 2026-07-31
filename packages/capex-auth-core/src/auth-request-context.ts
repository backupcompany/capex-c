import { AsyncLocalStorage } from 'async_hooks';
import type { ResolvedAuthContext } from './types/resolved-auth-context';

/** Per-request auth context — shared singleton via @capex/auth-core. */
export const authRequestContext = new AsyncLocalStorage<ResolvedAuthContext>();

export function getAuthRequestContext(): ResolvedAuthContext | undefined {
  return authRequestContext.getStore();
}
