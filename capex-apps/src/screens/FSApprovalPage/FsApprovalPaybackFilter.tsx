import React, { memo } from 'react';
import { NumericInput } from '@/components/atoms/NumericInput/NumericInput';

type FsApprovalPaybackFilterProps = {
  paybackMin: number | undefined;
  paybackMax: number | undefined;
  paybackMinActive: boolean;
  paybackMaxActive: boolean;
  onPaybackMinChange: (value: number | undefined) => void;
  onPaybackMaxChange: (value: number | undefined) => void;
  onPaybackMinActiveChange: (active: boolean) => void;
  onPaybackMaxActiveChange: (active: boolean) => void;
};

function FsApprovalPaybackFilterInner({
  paybackMin,
  paybackMax,
  paybackMinActive,
  paybackMaxActive,
  onPaybackMinChange,
  onPaybackMaxChange,
  onPaybackMinActiveChange,
  onPaybackMaxActiveChange,
}: FsApprovalPaybackFilterProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-siloam-text-secondary">Payback in Month (range)</p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 flex-1">
          <input
            type="checkbox"
            checked={paybackMinActive}
            onChange={(e) => onPaybackMinActiveChange(e.target.checked)}
            className="h-4 w-4 rounded border-siloam-border text-siloam-blue"
          />
          <span className="text-xs text-siloam-text-secondary shrink-0">Min</span>
          <NumericInput
            value={paybackMin ?? 0}
            onValueChange={onPaybackMinChange}
            disabled={!paybackMinActive}
            allowDecimal={false}
            align="center"
            className="w-full px-2 py-1.5 border border-siloam-border rounded-md bg-siloam-bg text-sm disabled:opacity-50"
          />
        </label>
        <span className="text-siloam-text-secondary font-bold">–</span>
        <label className="flex items-center gap-2 flex-1">
          <input
            type="checkbox"
            checked={paybackMaxActive}
            onChange={(e) => onPaybackMaxActiveChange(e.target.checked)}
            className="h-4 w-4 rounded border-siloam-border text-siloam-blue"
          />
          <span className="text-xs text-siloam-text-secondary shrink-0">Max</span>
          <NumericInput
            value={paybackMax ?? 0}
            onValueChange={onPaybackMaxChange}
            disabled={!paybackMaxActive}
            allowDecimal={false}
            align="center"
            className="w-full px-2 py-1.5 border border-siloam-border rounded-md bg-siloam-bg text-sm disabled:opacity-50"
          />
        </label>
      </div>
    </div>
  );
}

export const FsApprovalPaybackFilter = memo(FsApprovalPaybackFilterInner);
FsApprovalPaybackFilter.displayName = 'FsApprovalPaybackFilter';
