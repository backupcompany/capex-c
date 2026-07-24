import type { ChangeSummary } from '@/types';

/** Only block navigation when there are concrete diffs — not a stale isDirty flag. */
export function resolvePendingUnsavedChanges(
  getSummary: () => ChangeSummary | null,
): ChangeSummary | null {
  const summary = getSummary();
  if (!summary?.changes?.length) return null;
  return summary;
}
