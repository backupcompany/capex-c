import { useDeferredValue, useMemo } from 'react';
import type { EnrichedAsset } from '../../../types';
import type { ClientFilteredProjectListPage } from '../listUtils';

export type ProjectListTableDisplayInput = {
  useClientFilteredDisplay: boolean;
  clientFilteredPage: ClientFilteredProjectListPage | null;
  serverPageAssets: EnrichedAsset[];
  serverPageTotalCount: number | null;
  /** Defer visible rows during search/filter transitions (BDD Construction pattern). */
  deferTableRows?: boolean;
};

export type ProjectListTableDisplay = {
  paginatedAssets: EnrichedAsset[];
  tableAssets: EnrichedAsset[];
  footerTotalCount: number;
};

/**
 * Derive visible page rows — server page bundle or client-filter slice (BDD-style).
 */
export function useProjectListTableDisplay({
  useClientFilteredDisplay,
  clientFilteredPage,
  serverPageAssets,
  serverPageTotalCount,
  deferTableRows = false,
}: ProjectListTableDisplayInput): ProjectListTableDisplay {
  const paginatedAssets = useMemo(() => {
    if (useClientFilteredDisplay && clientFilteredPage) return clientFilteredPage.assets;
    return serverPageAssets;
  }, [useClientFilteredDisplay, clientFilteredPage, serverPageAssets]);

  const deferredTableAssets = useDeferredValue(paginatedAssets);
  const tableAssets = deferTableRows ? deferredTableAssets : paginatedAssets;

  const footerTotalCount = useMemo(() => {
    if (useClientFilteredDisplay && clientFilteredPage) {
      return clientFilteredPage.totalAssetCount;
    }
    if (serverPageTotalCount != null) return serverPageTotalCount;
    return serverPageAssets.length;
  }, [
    useClientFilteredDisplay,
    clientFilteredPage,
    serverPageTotalCount,
    serverPageAssets.length,
  ]);

  return {
    paginatedAssets,
    tableAssets,
    footerTotalCount,
  };
}
