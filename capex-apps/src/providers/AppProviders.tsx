'use client';

import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { useMemo, useState, type ReactNode } from 'react';
import { shouldDehydratePersistedQuery, TANSTACK_PERSIST_STORAGE_KEY } from '../lib/queryDehydrate';

const PERSIST_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24 jam

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 120_000,
        gcTime: 1000 * 60 * 60 * 24,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        /** Cache-first navigation; invalidasi Realtime / mutasi memicu refetch bila perlu. */
        refetchOnMount: false,
        placeholderData: keepPreviousData,
        retry: (failureCount, error) => {
          if (failureCount >= 1) return false;
          const status =
            error != null &&
            typeof error === 'object' &&
            'status' in error &&
            Number((error as { status?: number }).status) === 503;
          if (status) return false;
          const msg = error instanceof Error ? error.message : String(error ?? '');
          if (/\b503\b/.test(msg) || /service unavailable/i.test(msg)) return false;
          return true;
        },
        networkMode: 'offlineFirst',
      },
    },
  });
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  const persister = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: TANSTACK_PERSIST_STORAGE_KEY,
      throttleTime: 800,
    });
  }, []);

  if (!persister) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE_MS,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldDehydratePersistedQuery,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
