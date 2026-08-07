"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect } from "react";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { resetAuthProbeGate } from "@/lib/auth/authProbeGate";
import { useAuthStore } from "@/stores/authStore";

const App = dynamic(() => import("@/App"), { ssr: false });

type Props = {
  children: React.ReactNode;
  /** From server cookies — skip /api/auth/session when false (clean login page). */
  hasSessionCookies: boolean;
};

export function MainShellClient({ children, hasSessionCookies }: Props) {
  // HMR keeps zustand sessionReady — reset before child effects fire network calls.
  useLayoutEffect(() => {
    resetAuthProbeGate();
    const store = useAuthStore.getState();
    store.setAuthProbeComplete(false);
    store.setSessionReady(false);
  }, []);

  useLayoutEffect(() => {
    resetAuthProbeGate();
    const store = useAuthStore.getState();
    store.setAuthProbeComplete(false);
    store.setSessionReady(false);
  }, [hasSessionCookies]);

  return (
    <PermissionsProvider>
      <App hasSessionCookies={hasSessionCookies} />
      {children}
    </PermissionsProvider>
  );
}
