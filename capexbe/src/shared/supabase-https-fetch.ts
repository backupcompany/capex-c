import * as https from 'node:https';
import { URL } from 'node:url';

const DEFAULT_SUPABASE_FETCH_TIMEOUT_MS = 30_000;

function parseSupabaseFetchTimeoutMs(): number {
  const raw = process.env.SUPABASE_FETCH_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_SUPABASE_FETCH_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SUPABASE_FETCH_TIMEOUT_MS;
}

/**
 * fetch() for Supabase using Node https (honours win-ca / NODE_EXTRA_CA_CERTS on Windows).
 * Supabase JS defaults to undici, which may not use the same trust store as https.request.
 */
export function supabaseHttpsFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === 'string'
      ? new URL(input)
      : input instanceof URL
        ? input
        : new URL((input as Request).url);

  const method = (init?.method ?? 'GET').toUpperCase();
  const headerInit = init?.headers;
  const headers: Record<string, string> = {};
  if (headerInit instanceof Headers) {
    headerInit.forEach((v, k) => {
      headers[k] = v;
    });
  } else if (Array.isArray(headerInit)) {
    for (const [k, v] of headerInit) headers[k] = v;
  } else if (headerInit && typeof headerInit === 'object') {
    Object.assign(headers, headerInit as Record<string, string>);
  }

  let body: string | Buffer | undefined;
  if (init?.body != null) {
    if (typeof init.body === 'string') {
      body = init.body;
    } else if (Buffer.isBuffer(init.body)) {
      body = init.body;
    } else if (init.body instanceof Uint8Array) {
      body = Buffer.from(init.body);
    } else {
      body = String(init.body);
    }
  }

  return new Promise((resolve, reject) => {
    const timeoutMs = parseSupabaseFetchTimeoutMs();
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks);
          const status = res.statusCode ?? 500;
          const outHeaders = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value == null) continue;
            if (Array.isArray(value)) {
              for (const v of value) outHeaders.append(key, v);
            } else {
              outHeaders.set(key, value);
            }
          }
          const responseInit: ResponseInit = {
            status,
            statusText: res.statusMessage,
            headers: outHeaders,
          };
          // Node fetch rejects Response( body, { status: 204 } ) — must use null body.
          const noBody = status === 204 || status === 205 || status === 304;
          finish(() => {
            resolve(
              noBody || responseBody.length === 0
                ? new Response(null, responseInit)
                : new Response(responseBody, responseInit),
            );
          });
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy(new Error(`Supabase fetch timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    req.on('error', (err) => finish(() => reject(err)));
    if (body != null) req.write(body);
    req.end();
  });
}
