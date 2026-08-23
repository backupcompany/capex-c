/**
 * Formats a number into a currency string (IDR).
 * Always `Rp ` + thousand separators (id-ID), e.g. "Rp 1.000.000".
 */
export const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || typeof value !== 'number' || Number.isNaN(value)) {
    return 'Rp 0';
  }
  const truncated = Math.trunc(value);
  const body = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(truncated));
  return truncated < 0 ? `-Rp ${body}` : `Rp ${body}`;
};

/**
 * Budget view: full nominal IDR with dot thousand separators (e.g. Rp 1.234.567.890).
 * Use in KPI cards, tables, and tooltips where users need to read exact amounts.
 */
export const formatBudgetView = formatCurrency;

/**
 * Parses a formatted currency string (IDR) into a number.
 * @param value - The formatted string, e.g., "Rp 1.000.000".
 * @returns The parsed number.
 */
export const parseCurrency = (value: string): number => {
    if (typeof value !== 'string') return 0;
    // Remove "Rp", whitespace, and thousand separators "."
    const numericString = value.replace(/Rp\s*|\./g, '');
    return Number.parseInt(numericString, 10) || 0;
};

/** Scaled amount with Indonesian grouping (e.g. 2248860.4 → "2.248.860,4"). */
function formatScaledAmount(scaled: number): string {
  const rounded = Math.round(scaled * 10) / 10;
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(rounded);
}

const ABBREVIATED_CURRENCY_TIERS = [
  { threshold: 1_000_000_000_000, divisor: 1_000_000_000_000, suffix: ' T' },
  { threshold: 1_000_000_000, divisor: 1_000_000_000, suffix: ' M' },
  { threshold: 1_000_000, divisor: 1_000_000, suffix: ' Jt' },
  { threshold: 1_000, divisor: 1_000, suffix: ' Rb' },
] as const;

/**
 * Compact IDR for KPI cards and chart axes.
 * Uses Indonesian scale: Rb (ribu), Jt (juta), M (miliar), T (triliun).
 */
export const formatAbbreviatedCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || typeof value !== 'number' || Number.isNaN(value)) {
    return 'Rp 0';
  }

  const sign = value < 0 ? '-' : '';
  const absValue = Math.abs(value);

  if (absValue < 1_000) {
    return formatCurrency(value);
  }

  const tier =
    ABBREVIATED_CURRENCY_TIERS.find((t) => absValue >= t.threshold) ??
    ABBREVIATED_CURRENCY_TIERS[ABBREVIATED_CURRENCY_TIERS.length - 1];

  const scaled = absValue / tier.divisor;
  return `${sign}Rp ${formatScaledAmount(scaled)}${tier.suffix}`;
};

/** Alias for table/view budget display (abbreviated scale). */
export const formatScaledCurrency = formatAbbreviatedCurrency;