/** True after startup /auth/session probe finishes — blocks premature logout on 401. */
let authProbeComplete = false;

export function resetAuthProbeGate(): void {
  authProbeComplete = false;
}

export function markAuthProbeComplete(): void {
  authProbeComplete = true;
}

export function isAuthProbeComplete(): boolean {
  return authProbeComplete;
}
