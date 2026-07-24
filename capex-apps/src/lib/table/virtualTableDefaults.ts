/** Shared TanStack Virtual defaults for large editable/read-only tables. */
export const SPREADSHEET_VIRTUAL_DEFAULTS = {
  estimatedRowHeight: 44,
  virtualThreshold: 25,
  overscan: 8,
  defaultMaxHeight: '480px',
} as const;

export const GENERIC_TABLE_VIRTUAL_DEFAULTS = {
  estimatedRowHeight: 52,
  virtualThreshold: 25,
  overscan: 8,
} as const;
