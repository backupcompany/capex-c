/** Defer non-critical prefetches so boot / navigation stays responsive. */
export function scheduleIdlePrefetch(fn: () => void, timeoutMs = 4_000): void {
  if (typeof window === 'undefined') return;
  const run = () => {
    try {
      fn();
    } catch {
      /* best-effort warm */
    }
  };
  // Prefer typeof check — `in` narrowing can collapse Window to `never` under strict TS.
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: timeoutMs });
  } else {
    globalThis.setTimeout(run, 1_500);
  }
}

/** Run tasks one-by-one when the browser is idle (avoids prefetch storms). */
export function scheduleStaggeredIdle(tasks: Array<() => void>, gapMs = 900): void {
  tasks.forEach((task, index) => {
    scheduleIdlePrefetch(task, 2_000 + index * gapMs);
  });
}
