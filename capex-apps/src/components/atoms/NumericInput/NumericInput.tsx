import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampNumericValue,
  formatNumericForInputMode,
  normalizeNumericTyping,
  parseGroupedNumericInput,
  parseNumericInput,
  parseNumericInputMode,
} from '../../../lib/numericInput';
import { caretAfterDigitCount, digitCountBefore } from '../CurrencyInput/currencyInputCaret';

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onValueChange: (value: number) => void;
  allowDecimal?: boolean;
  /** Show Indonesian thousand separators while typing (e.g. 1.000.000.000). */
  groupThousands?: boolean;
  align?: 'left' | 'right' | 'center';
}

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onValueChange,
  allowDecimal = true,
  groupThousands = false,
  align = 'right',
  className = '',
  disabled,
  min,
  max,
  onFocus,
  onBlur,
  ...rest
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => formatNumericForInputMode(value, groupThousands));
  const [isFocused, setIsFocused] = useState(false);
  const pendingCaret = useRef<number | null>(null);

  const minNum = min !== undefined ? Number(min) : undefined;
  const maxNum = max !== undefined ? Number(max) : undefined;
  const useGroupedIntegers = groupThousands && !allowDecimal;

  useEffect(() => {
    if (!isFocused) {
      setText(formatNumericForInputMode(value, useGroupedIntegers));
    }
  }, [value, isFocused, useGroupedIntegers]);

  useEffect(() => {
    if (pendingCaret.current == null || !inputRef.current) return;
    const pos = pendingCaret.current;
    pendingCaret.current = null;
    inputRef.current.setSelectionRange(pos, pos);
  }, [text]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const caret = e.target.selectionStart ?? raw.length;

      if (useGroupedIntegers) {
        const digitsOnly = raw.replace(/\D/g, '');
        if (!digitsOnly) {
          pendingCaret.current = 0;
          setText('');
          onValueChange(0);
          return;
        }
        const digitsBefore = digitCountBefore(raw, caret);
        const parsed = clampNumericValue(parseGroupedNumericInput(raw), minNum, maxNum);
        const formatted = formatNumericForInputMode(parsed, true);
        pendingCaret.current = caretAfterDigitCount(formatted, digitsBefore);
        setText(formatted);
        onValueChange(parsed);
        return;
      }

      let next = allowDecimal ? raw.replace(/[^\d.-]/g, '') : raw.replace(/[^\d-]/g, '');
      next = normalizeNumericTyping(next);
      const parsed = clampNumericValue(parseNumericInput(next), minNum, maxNum);
      onValueChange(parsed);
      setText(next);
    },
    [allowDecimal, maxNum, minNum, onValueChange, useGroupedIntegers],
  );

  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      value={text}
      disabled={disabled}
      onChange={handleChange}
      onFocus={(e) => {
        setIsFocused(true);
        // Keep value intact so user can edit one digit mid-number (Ctrl/Cmd+A still selects all).
        const el = e.currentTarget;
        requestAnimationFrame(() => {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        });
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        const parsed = clampNumericValue(parseNumericInputMode(text, useGroupedIntegers), minNum, maxNum);
        onValueChange(parsed);
        setText(formatNumericForInputMode(parsed, useGroupedIntegers));
        onBlur?.(e);
      }}
      className={`${alignClass} tabular-nums ${className}`.trim()}
    />
  );
};

NumericInput.displayName = 'NumericInput';
