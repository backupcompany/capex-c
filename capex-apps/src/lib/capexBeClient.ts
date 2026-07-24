import axios from 'axios';
import { useBackendSession } from './auth/authConstants';
import {
  capexBeAxiosPost,
  isAxiosCanceled,
  isAxiosNetworkError,
  parseAxiosErrorMessage,
} from './http/capexBeAxios';

export function isCapexBeConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim();
}

function beBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_CAPEXBE_URL?.replace(/\/$/, '') ?? '';
  if (!base.trim()) throw new Error('NEXT_PUBLIC_CAPEXBE_URL is not set');
  return base;
}

/**
 * In the browser, always proxy through `/api/be` (same-origin) so Netlify → Railway
 * does not require CORS. Server-side keeps direct BE URL when backend session is off.
 */
export function useBeBffProxy(): boolean {
  if (!isCapexBeConfigured()) return false;
  if (typeof window !== 'undefined') return true;
  return useBackendSession();
}

export function capexBeRequestUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (useBeBffProxy()) return `/api/be${normalized}`;
  return `${beBaseUrl()}${normalized}`;
}

export class CapexBeHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CapexBeHttpError';
    this.status = status;
  }
}

export function isCapexBeUnauthorizedError(e: unknown): boolean {
  if (e instanceof CapexBeHttpError && e.status === 401) return true;
  if (e instanceof Error) {
    const m = e.message.toLowerCase();
    return (
      m.includes('401') ||
      m.includes('unauthorized') ||
      m.includes('invalid or expired session') ||
      m.includes('missing authorization')
    );
  }
  return false;
}

export function isCapexBeNetworkError(e: unknown): boolean {
  if (isAxiosCanceled(e)) return false;
  if (isAxiosNetworkError(e)) return true;
  if (e instanceof TypeError) {
    const m = e.message.toLowerCase();
    return m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed');
  }
  if (e instanceof Error) {
    const m = e.message.toLowerCase();
    return m.includes('failed to fetch') || m.includes('network error') || m.includes('cors');
  }
  return false;
}

export type PostToCapexBeOptions = {
  /** TanStack Query / AbortController — cancels in-flight request when query key changes. */
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function postToCapexBe<T>(
  path: string,
  body: unknown,
  accessToken?: string | null,
  options?: PostToCapexBeOptions,
): Promise<T> {
  const bff = useBeBffProxy();
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    return await capexBeAxiosPost<T>(capexBeRequestUrl(path), body, {
      headers,
      withCredentials: bff ? true : undefined,
      retryOn401: bff && useBackendSession(),
      signal: options?.signal,
      timeout: options?.timeoutMs,
    });
  } catch (error) {
    if (isAxiosCanceled(error)) throw error;
    if (axios.isAxiosError(error)) {
      throw new CapexBeHttpError(parseAxiosErrorMessage(error), error.response?.status ?? 0);
    }
    throw error;
  }
}
