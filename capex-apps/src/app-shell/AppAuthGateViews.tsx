'use client';

import { Toast } from '@/components/atoms/Toast/Toast';
import { LoginPage } from '@/screens/LoginPage';
import { ToastProvider, type ShowToastOptions } from '@/contexts/ToastContext';

type ToastState = {
  id: number;
  message: string;
  type: 'success' | 'error';
  title?: string;
} | null;

type AppAuthGateViewsProps = {
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

/** Unauthenticated — login UI at `/` (no redirect to separate /login route). */
export function AppAuthGateViews({ toast, dismissToast, showToast }: AppAuthGateViewsProps) {
  return (
    <ToastProvider showToast={showToast}>
      <LoginPage />
      {toast ? <AuthToast toast={toast} dismissToast={dismissToast} /> : null}
    </ToastProvider>
  );
}
