import { fetchAuthSession } from './authApi';

/** Lightweight session check — reuses fetchAuthSession dedupe (no parallel /session). */
export async function isBackendSessionValid(): Promise<boolean> {
  try {
    const me = await fetchAuthSession();
    return me?.authenticated === true;
  } catch {
    return false;
  }
}
