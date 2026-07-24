import { scheduleIdlePrefetch, scheduleStaggeredIdle } from './scheduleIdlePrefetch';

/** Max concurrent background prefetches after bootstrap settles. */
const MAX_INFLIGHT = 2;
let inflightCount = 0;
const waitQueue: Array<() => void> = [];

function drainQueue(): void {
  while (inflightCount < MAX_INFLIGHT && waitQueue.length > 0) {
    const next = waitQueue.shift();
    if (!next) break;
    inflightCount += 1;
    void Promise.resolve()
      .then(() => next())
      .catch(() => {
        /* best-effort warm */
      })
      .finally(() => {
        inflightCount -= 1;
        drainQueue();
      });
  }
}

/** Queue a network prefetch — caps parallel BE calls per browser tab. */
export function enqueueNetworkPrefetch(fn: () => void | Promise<void>): void {
  waitQueue.push(() => {
    void fn();
  });
  drainQueue();
}

/** Defer non-critical bootstrap side-effect prefetches until idle. */
export function scheduleBootstrapSidePrefetches(tasks: Array<() => void>): void {
  scheduleStaggeredIdle(
    tasks.map((task) => () => enqueueNetworkPrefetch(task)),
    1_200,
  );
}

const intentDebounceMs = 350;
const lastIntentAt = new Map<string, number>();
const intentTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounce sidebar/hover prefetches — one burst per route per window. */
export function scheduleRouteIntentPrefetch(routeKey: string, fn: () => void): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  const last = lastIntentAt.get(routeKey) ?? 0;
  if (now - last < intentDebounceMs) {
    const existing = intentTimers.get(routeKey);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      intentTimers.delete(routeKey);
      lastIntentAt.set(routeKey, Date.now());
      scheduleIdlePrefetch(() => enqueueNetworkPrefetch(fn), 2_500);
    }, intentDebounceMs);
    intentTimers.set(routeKey, timer);
    return;
  }

  lastIntentAt.set(routeKey, now);
  scheduleIdlePrefetch(() => enqueueNetworkPrefetch(fn), 2_500);
}

/** Active-route warm after paint — slightly lower priority than user clicks. */
export function scheduleRouteNetworkPrefetch(fn: () => void | Promise<void>): void {
  scheduleIdlePrefetch(() => enqueueNetworkPrefetch(fn), 3_500);
}
