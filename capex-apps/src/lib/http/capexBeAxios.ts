import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { CSRF_HEADER, useBackendSession } from '../auth/authConstants';
import { authDebug } from '../auth/authDebug';
import { coordinatedRefreshSession } from '../auth/authRefreshCoordinator';
import { isBackendSessionValid } from '../auth/sessionValidity';
import { getCsrfToken } from '../auth/csrfToken';

const MAX_401_RETRIES = 1;
const MAX_503_RETRIES = 1;
const RETRY_503_DELAY_MS = 900;
const RETRY_503_JITTER_MS = 400;

export type CapexBeAxiosRequestConfig = AxiosRequestConfig & {
  /** Retry once after refresh on 401. Default true when backend session is enabled. */
  retryOn401?: boolean;
  _retry401Count?: number;
  _retry503Count?: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Shared axios instance for capexbe BFF — interceptors handle CSRF, 401, 503. */
export const capexBeAxios = axios.create({
  headers: { 'Content-Type': 'application/json' },
  transitional: { clarifyTimeoutError: true },
});

capexBeAxios.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (method !== 'get' && method !== 'head' && method !== 'options') {
    const csrf = getCsrfToken();
    if (csrf) {
      config.headers.set(CSRF_HEADER, csrf);
    }
  }
  return config;
});

capexBeAxios.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as CapexBeAxiosRequestConfig | undefined;
    if (!config) return Promise.reject(error);

    const status = error.response?.status;

    if (status === 503 && (config._retry503Count ?? 0) < MAX_503_RETRIES) {
      config._retry503Count = (config._retry503Count ?? 0) + 1;
      authDebug('axios 503: retrying', { url: config.url, attempt: config._retry503Count });
      await delay(
        RETRY_503_DELAY_MS * config._retry503Count + Math.floor(Math.random() * RETRY_503_JITTER_MS),
      );
      return capexBeAxios.request(config);
    }

    const retryOn401 = config.retryOn401 ?? useBackendSession();
    if (status === 401 && retryOn401 && (config._retry401Count ?? 0) < MAX_401_RETRIES) {
      authDebug('axios 401: attempting refresh', {
        url: config.url,
        attempt: config._retry401Count ?? 0,
      });

      const refreshed = await coordinatedRefreshSession();
      if (!refreshed) {
        const stillValid = await isBackendSessionValid();
        if (!stillValid) {
          authDebug('axios 401: session invalid — cleanup');
          const { invalidateStaleAuthCookies, invalidateAuthProbeCache, clearServerAuthCookies } =
            await import('../auth/authApi');
          invalidateStaleAuthCookies();
          invalidateAuthProbeCache();
          void clearServerAuthCookies();
          const { useAuthStore } = await import('../../stores/authStore');
          if (useAuthStore.getState().status === 'authenticated') {
            const { notifyAuthFailure } = await import('../auth/authFailureHandler');
            notifyAuthFailure();
          }
        } else {
          authDebug('axios 401: refresh failed but /me still valid — keep session');
        }
        return Promise.reject(error);
      }

      config._retry401Count = (config._retry401Count ?? 0) + 1;
      return capexBeAxios.request(config);
    }

    return Promise.reject(error);
  },
);

export function isAxiosCanceled(error: unknown): boolean {
  return axios.isCancel(error);
}

export function isAxiosNetworkError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (isAxiosCanceled(error)) return false;
  return !error.response;
}

export function parseAxiosErrorMessage(error: AxiosError): string {
  const data = error.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object' && 'message' in data) {
    const m = (data as { message?: string | string[] }).message;
    if (Array.isArray(m)) return m.join('; ');
    if (typeof m === 'string' && m.trim()) return m;
  }
  return error.message || `${error.response?.status ?? 0} request failed`;
}

export async function capexBeAxiosPost<T>(
  url: string,
  data: unknown,
  config: Omit<CapexBeAxiosRequestConfig, 'url' | 'method' | 'data'> = {},
): Promise<T> {
  const res = await capexBeAxios.post<T>(url, data, config);
  return res.data;
}
