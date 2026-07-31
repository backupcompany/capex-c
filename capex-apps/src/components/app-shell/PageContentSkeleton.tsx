import React from 'react';

export type PageSkeletonVariant = 'dashboard' | 'budget' | 'table' | 'settings';

type Props = {
  variant: PageSkeletonVariant;
};

/** Lightweight gray placeholder — stays in main bundle for instant Suspense fallback. */
export function PageContentSkeleton({ variant }: Props) {
  if (variant === 'dashboard') {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Memuat halaman">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-siloam-border/40" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="h-64 rounded-xl bg-siloam-border/30" />
          <div className="h-64 rounded-xl bg-siloam-border/30" />
        </div>
      </div>
    );
  }

  if (variant === 'budget') {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Memuat halaman">
        <div className="bg-siloam-surface p-4 rounded-xl border border-siloam-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-siloam-border/50 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="bg-siloam-surface rounded-xl border border-siloam-border overflow-hidden">
          <div className="h-10 bg-siloam-sidebar/80" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 border-t border-siloam-border flex items-center px-4 gap-4">
              <div className="h-4 w-32 bg-siloam-border/60 rounded" />
              <div className="h-4 w-40 bg-siloam-border/50 rounded" />
              <div className="h-4 w-24 bg-siloam-border/40 rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'settings') {
    return (
      <div className="max-w-3xl space-y-4 animate-pulse" aria-busy="true" aria-label="Memuat halaman">
        <div className="h-10 w-48 bg-siloam-border/50 rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 bg-siloam-border/30 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Memuat halaman">
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-40 bg-siloam-border/50 rounded-lg" />
        <div className="h-10 w-32 bg-siloam-border/40 rounded-lg" />
      </div>
      <div className="bg-siloam-surface rounded-xl border border-siloam-border overflow-hidden">
        <div className="h-10 bg-siloam-sidebar/80" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-11 border-t border-siloam-border flex items-center px-4 gap-3">
            <div className="h-4 w-6 bg-siloam-border/40 rounded" />
            <div className="h-4 flex-1 max-w-xs bg-siloam-border/50 rounded" />
            <div className="h-4 w-20 bg-siloam-border/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
