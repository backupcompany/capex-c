export const TABLE_PAGE_SIZE_OPTIONS = [20, 25, 50, 100] as const;

export const DEFAULT_TABLE_PAGE_SIZE = 20;

export const MAX_TABLE_PAGE_SIZE = 100;

export function clampTablePageSize(size: number): number {
  if (!Number.isFinite(size) || size <= 0) return DEFAULT_TABLE_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(size), TABLE_PAGE_SIZE_OPTIONS[0]), MAX_TABLE_PAGE_SIZE);
}
