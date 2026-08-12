'use client';

/** Visible when FE shell is up but backend bootstrap/API failed — not a blank-page gate. */
export function BackendServiceBanner({ message }: { message?: string }) {
  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <p className="font-semibold">Frontend loaded — backend service issue</p>
      <p className="mt-1 text-amber-900/90">
        {message?.trim() ||
          'UI and routes are available. Data/actions need capex-api (and PostgREST if VPS mode).'}
      </p>
    </div>
  );
}
