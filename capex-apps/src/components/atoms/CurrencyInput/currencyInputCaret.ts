/** Digits to the left of caret (ignores Rp / separators). */
export function digitCountBefore(text: string, caret: number): number {
  return text.slice(0, Math.max(0, caret)).replace(/\D/g, '').length;
}

/** Caret after the Nth digit in a formatted currency string. */
export function caretAfterDigitCount(formatted: string, digitCount: number): number {
  if (digitCount <= 0) {
    const m = formatted.match(/^Rp\s*/);
    return m ? m[0].length : 0;
  }
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]!)) {
      seen += 1;
      if (seen >= digitCount) return i + 1;
    }
  }
  return formatted.length;
}
