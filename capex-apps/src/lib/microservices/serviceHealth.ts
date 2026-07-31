/**
 * Probe leaf + gateway health endpoints (server-only, used by BFF ops route).
 */
import {
  EXTRACTABLE_SERVICE_ROUTES,
  activeServiceRouteOverrides,
  defaultBackendBase,
} from '@/lib/auth/serviceRoutes';

export type ServiceHealthEntry = {
  name: string;
  url: string;
  envVar: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  error?: string;
};

export type ServicesHealthSnapshot = {
  ts: number;
  allOk: boolean;
  gateway: ServiceHealthEntry;
  auth: ServiceHealthEntry | null;
  leaves: ServiceHealthEntry[];
};

const PROBE_TIMEOUT_MS = 4000;

async function probeOne(
  name: string,
  envVar: string,
  url: string,
): Promise<ServiceHealthEntry> {
  const base = url.replace(/\/$/, '');
  const started = Date.now();
  try {
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: 'no-store',
    });
    return {
      name,
      url: base,
      envVar,
      ok: res.status === 200,
      status: res.status,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      name,
      url: base,
      envVar,
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : 'unreachable',
    };
  }
}

/** Poll gateway + auth leaf + all configured leaf overrides. */
export async function collectServicesHealth(): Promise<ServicesHealthSnapshot> {
  const gatewayUrl = defaultBackendBase();
  const gateway = gatewayUrl
    ? await probeOne('gateway', 'NEXT_PUBLIC_CAPEXBE_URL', gatewayUrl)
    : {
        name: 'gateway',
        url: '',
        envVar: 'NEXT_PUBLIC_CAPEXBE_URL',
        ok: false,
        status: 0,
        latencyMs: 0,
        error: 'not configured',
      };

  const authUrl = process.env.CAPEX_SERVICE_AUTH_URL?.trim();
  const auth = authUrl
    ? await probeOne('auth', 'CAPEX_SERVICE_AUTH_URL', authUrl)
    : null;

  const overrides = activeServiceRouteOverrides();
  const configured = new Map(overrides.map((o) => [o.name, o]));

  const leaves: ServiceHealthEntry[] = [];
  for (const route of EXTRACTABLE_SERVICE_ROUTES) {
    const hit = configured.get(route.name);
    if (!hit?.url) continue;
    leaves.push(await probeOne(route.name, route.envVar, hit.url));
  }

  const allOk =
    gateway.ok &&
    (auth == null || auth.ok) &&
    leaves.every((l) => l.ok) &&
    leaves.length === EXTRACTABLE_SERVICE_ROUTES.length;

  return { ts: Date.now(), allOk, gateway, auth, leaves };
}
