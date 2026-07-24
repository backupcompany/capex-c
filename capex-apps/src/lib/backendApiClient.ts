import axios from 'axios';
import { getAccessTokenForBackend } from './authSession';
import { trackBackendFetch } from './backendFetchTelemetry';
import { useBackendSession } from './auth/authConstants';
import {
  capexBeAxiosPost,
  isAxiosCanceled,
  isAxiosNetworkError,
} from './http/capexBeAxios';
import { capexBeRequestUrl, isCapexBeConfigured } from './capexBeClient';

export type PostBackendOptions = {
  /** Telemetry source key, e.g. `fsApproval.bundle` */
  source: string;
  timeoutMs?: number;
  /** When true, missing base URL or token returns null without fetch */
  requireAuth?: boolean;
  signal?: AbortSignal;
};

/**
 * Shared POST helper for NestJS BFF endpoints.
 * Matches existing *Api.ts pattern: Bearer token, JSON body, telemetry, null on failure.
 */
export async function postBackend<T>(
  path: string,
  body: Record<string, unknown>,
  options: PostBackendOptions,
): Promise<T | null> {
  const { source, timeoutMs = 12_000, requireAuth = true, signal } = options;

  if (!isCapexBeConfigured()) {
    trackBackendFetch(source, 'fallback', { reason: 'missing_base_url' });
    return null;
  }

  const cookieMode = useBackendSession();
  let accessToken: string | undefined;
  if (requireAuth && !cookieMode) {
    const token = await getAccessTokenForBackend();
    accessToken = token ?? undefined;
    if (!accessToken) {
      trackBackendFetch(source, 'fallback', { reason: 'missing_access_token' });
      return null;
    }
  }

  try {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const data = await capexBeAxiosPost<T>(capexBeRequestUrl(path), body, {
      headers,
      withCredentials: cookieMode ? true : undefined,
      retryOn401: cookieMode,
      signal,
      timeout: timeoutMs,
    });

    trackBackendFetch(source, 'success');
    return data;
  } catch (error) {
    if (isAxiosCanceled(error)) throw error;
    if (axios.isAxiosError(error) && error.response) {
      trackBackendFetch(source, 'fallback', {
        reason: 'http_error',
        httpStatus: error.response.status,
      });
      return null;
    }
    if (isAxiosNetworkError(error)) {
      trackBackendFetch(source, 'fallback', { reason: 'network_error' });
      return null;
    }
    trackBackendFetch(source, 'fallback', { reason: 'network_error' });
    return null;
  }
}

export function isBackendConfigured(): boolean {
  return isCapexBeConfigured();
}
