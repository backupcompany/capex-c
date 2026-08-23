import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatCurrency, parseCurrency } from '../../../lib/formatter';
import { clampNumericValue } from '../../../lib/numericInput';
import { caretAfterDigitCount, digitCountBefore } from './currencyInputCaret';

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onValueChange: (value: number) => void;
  align?: 'left' | 'right' | 'center';
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onValueChange,
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
  const [text, setText] = useState(() => formatCurrency(value));
  const [isFocused, setIsFocused] = useState(false);
  const pendingCaret = useRef<number | null>(null);

  const minNum = min !== undefined ? Number(min) : undefined;
  const maxNum = max !== undefined ? Number(max) : undefined;

  useEffect(() => {
    if (!isFocused) {
      setText(formatCurrency(value));
    }
  }, [value, isFocused]);

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
      const digitsBefore = digitCountBefore(raw, caret);
      const digitsOnly = raw.replace(/\D/g, '');

      if (!digitsOnly) {
        pendingCaret.current = caretAfterDigitCount('Rp ', 0);
        setText('Rp ');
        onValueChange(0);
        return;
      }

      const parsed = clampNumericValue(parseCurrency(raw), minNum, maxNum);
      const formatted = formatCurrency(parsed);
      pendingCaret.current = caretAfterDigitCount(formatted, digitsBefore);
      setText(formatted);
      onValueChange(parsed);
    },
    [maxNum, minNum, onValueChange],
  );

  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={text}
      disabled={disabled}
      onChange={handleChange}
      onFocus={(e) => {
        setIsFocused(true);
        // Keep value intact so user can edit one digit (Ctrl/Cmd+A still selects all).
        const el = e.currentTarget;
        requestAnimationFrame(() => {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        });
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        const parsed = clampNumericValue(parseCurrency(text), minNum, maxNum);
        onValueChange(parsed);
        setText(formatCurrency(parsed));
        onBlur?.(e);
      }}
      className={`${alignClass} tabular-nums ${className}`.trim()}
    />
  );
};

CurrencyInput.displayName = 'CurrencyInput';
