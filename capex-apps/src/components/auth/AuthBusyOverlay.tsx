'use client';

type AuthBusyOverlayProps = {
  title: string;
  subtitle?: string;
  /** Accessible name for the status screen. */
  label?: string;
};

/** Full-page auth pause (post-SSO / logout) — light bridge before the next screen. */
export function AuthBusyOverlay({ title, subtitle, label }: AuthBusyOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-siloam-bg px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label ?? title}
    >
      <div
        className="h-9 w-9 animate-spin rounded-full border-[2.5px] border-siloam-border border-t-siloam-blue"
        aria-hidden
      />
      <p className="text-center text-sm font-medium text-siloam-text-primary">{title}</p>
      {subtitle ? (
        <p className="max-w-xs text-center text-xs text-siloam-text-secondary">{subtitle}</p>
      ) : null}
    </div>
  );
}
