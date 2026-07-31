'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Toast } from '@/components/atoms/Toast/Toast';
import { PreAuthAppShell } from '@/components/organisms/PreAuthAppShell/PreAuthAppShell';
import { ToastProvider, type ShowToastOptions } from '@/contexts/ToastContext';
import { LOGIN_PATH } from '@/lib/auth/loginRoute';

type ToastState = {
  id: number;
  message: string;
  type: 'success' | 'error';
  title?: string;
} | null;

type AppAuthGateViewsProps = {
  authProbeComplete: boolean;
  currentUser: unknown;
  toast: ToastState;
  dismissToast: () => void;
  showToast: (message: string, type?: 'success' | 'error', options?: ShowToastOptions) => void;
};

function AuthToast({ toast, dismissToast }: { toast: NonNullable<ToastState>; dismissToast: () => void }) {
  return (
    <Toast
      key={toast.id}
      message={toast.message}
      type={toast.type}
      title={toast.title}
      onClose={dismissToast}
    />
  );
}

export function AppAuthGateViews({
  authProbeComplete,
  currentUser,
  toast,
  dismissToast,
  showToast,
}: AppAuthGateViewsProps) {
  const router = useRouter();

  useEffect(() => {
    if (authProbeComplete && !currentUser) {
      router.replace(LOGIN_PATH);
    }
  }, [authProbeComplete, currentUser, router]);

  if (!authProbeComplete) {
    return (
      <ToastProvider showToast={showToast}>
        <PreAuthAppShell />
        {toast ? <AuthToast toast={toast} dismissToast={dismissToast} /> : null}
      </ToastProvider>
    );
  }

  return (
    <ToastProvider showToast={showToast}>
      <PreAuthAppShell />
      {toast ? <AuthToast toast={toast} dismissToast={dismissToast} /> : null}
    </ToastProvider>
  );
}
