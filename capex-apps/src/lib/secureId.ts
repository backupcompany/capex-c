/**
 * Crypto-backed ids / jitter — prefer over Math.random (sonar typescript:S2245).
 * Browser + Edge have globalThis.crypto; Node 19+ too.
 */

export function secureId(prefix = ''): string {
  return `${prefix}${crypto.randomUUID()}`;
}

/** Uniform integer in [0, maxExclusive). */
export function secureInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % maxExclusive;
}
