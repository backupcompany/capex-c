import { useEffect, useState, type RefObject } from 'react';
import { clampTablePageSize, DEFAULT_TABLE_PAGE_SIZE } from './pageSizeOptions';
import { SPREADSHEET_VIRTUAL_DEFAULTS } from './virtualTableDefaults';

const TABLE_HEAD_PX = 44;

/** Page size + scroll height from visible table host (ResizeObserver). */
export function useViewportTablePageSize(containerRef: RefObject<HTMLElement | null>) {
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [maxHeightPx, setMaxHeightPx] = useState(480);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const rowPx = SPREADSHEET_VIRTUAL_DEFAULTS.estimatedRowHeight;
    const overscan = SPREADSHEET_VIRTUAL_DEFAULTS.overscan;

    const measure = () => {
      const h = Math.max(160, el.clientHeight);
      const bodyPx = Math.max(rowPx, h - TABLE_HEAD_PX);
      const visibleRows = Math.floor(bodyPx / rowPx);
      setPageSize(clampTablePageSize(visibleRows + overscan));
      setMaxHeightPx(Math.floor(h));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return { pageSize, maxHeightPx };
}
