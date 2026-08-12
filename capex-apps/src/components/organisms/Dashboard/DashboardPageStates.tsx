import React, { memo } from 'react';

export const DashboardEmptyPeriod = memo(function DashboardEmptyPeriod() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[40vh] p-8 bg-siloam-surface rounded-xl shadow-soft text-center"
      role="status"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-siloam-blue/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8 text-siloam-blue"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
      <p className="text-base font-semibold text-siloam-text-primary">Belum ada periode budget</p>
      <p className="mt-2 max-w-md text-sm text-siloam-text-secondary">
        Data dashboard akan tampil otomatis setelah periode budget tersedia. Hubungi admin jika perlu
        setup periode baru.
      </p>
    </div>
  );
});

export const DashboardError = memo(function DashboardError({ message }: { message: string }) {
  return <div className="text-center p-8 text-danger">{message}</div>;
});

export const DashboardBlockingSkeleton = memo(function DashboardBlockingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 bg-siloam-surface rounded-xl shadow-soft" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-80 bg-siloam-surface rounded-xl shadow-soft" />
        <div className="h-80 bg-siloam-surface rounded-xl shadow-soft" />
      </div>
      <div className="h-[480px] bg-siloam-surface rounded-xl shadow-soft" />
    </div>
  );
});

export const DashboardChartsSkeleton = memo(function DashboardChartsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-80 bg-siloam-surface rounded-xl shadow-soft" />
        <div className="h-80 bg-siloam-surface rounded-xl shadow-soft" />
      </div>
      <div className="h-[480px] bg-siloam-surface rounded-xl shadow-soft" />
    </div>
  );
});

export const DashboardBackendUnavailable = memo(function DashboardBackendUnavailable() {
  return (
    <div className="text-center p-8 bg-siloam-surface rounded-xl shadow-soft text-siloam-text-secondary">
      Dashboard UI loaded, but API returned no data. Check capex-api / PostgREST and sign-in session —
      not a missing frontend bundle.
    </div>
  );
});
