import type { QueryClient } from '@tanstack/react-query';

/** @deprecated Executive dashboard loads on user filter — no route prefetch. */
export function prefetchExecutiveDashboard(
  _queryClient: QueryClient,
  _periodName: string,
  _userId: number,
  _archetypeId: string | null = null,
): void {
  // Intentionally no-op — dashboard-kpi/charts fetch only after filter interaction.
}
