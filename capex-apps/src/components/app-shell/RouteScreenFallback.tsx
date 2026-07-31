import React from 'react';
import { Page } from '@/types';
import { PageContentSkeleton, type PageSkeletonVariant } from './PageContentSkeleton';

const PAGE_VARIANT: Partial<Record<Page, PageSkeletonVariant>> = {
  [Page.Dashboard]: 'dashboard',
  [Page.ExecutiveSummary]: 'dashboard',
  [Page.AIAnalytics]: 'dashboard',
  [Page.BudgetMultiYear]: 'budget',
  [Page.BudgetPeriod]: 'budget',
  [Page.BudgetArchetype]: 'budget',
  [Page.BudgetHU]: 'budget',
  [Page.Configuration]: 'settings',
  [Page.Profile]: 'settings',
};

type Props = {
  routePage: Page;
};

/** Instant UI shell while lazy screen chunk loads — data fetching happens inside the screen. */
export function RouteScreenFallback({ routePage }: Props) {
  const variant = PAGE_VARIANT[routePage] ?? 'table';
  return <PageContentSkeleton variant={variant} />;
}
