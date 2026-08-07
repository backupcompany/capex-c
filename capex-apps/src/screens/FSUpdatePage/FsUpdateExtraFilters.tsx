import React, { memo } from 'react';

type FsUpdateExtraFiltersProps = {
  showOnlyNotFSApproved: boolean;
  onShowOnlyNotFSApprovedChange: (checked: boolean) => void;
  focusNeedingApproval: boolean;
  onFocusNeedingApprovalChange: (checked: boolean) => void;
};

function FsUpdateExtraFiltersInner({
  showOnlyNotFSApproved,
  onShowOnlyNotFSApprovedChange,
  focusNeedingApproval,
  onFocusNeedingApprovalChange,
}: FsUpdateExtraFiltersProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center">
        <input
          id="show-only-not-fs-approved"
          type="checkbox"
          checked={showOnlyNotFSApproved}
          onChange={(e) => onShowOnlyNotFSApprovedChange(e.target.checked)}
          className="h-4 w-4 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
        />
        <label
          htmlFor="show-only-not-fs-approved"
          className="ml-2 text-sm font-medium text-siloam-text-primary"
        >
          Show only projects not FS Approved (Default)
        </label>
      </div>
      <div className="flex items-center">
        <input
          id="focus-approval"
          type="checkbox"
          checked={focusNeedingApproval}
          onChange={(e) => onFocusNeedingApprovalChange(e.target.checked)}
          className="h-4 w-4 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
        />
        <label htmlFor="focus-approval" className="ml-2 text-sm font-medium text-siloam-text-primary">
          Focus on items needing Approval
        </label>
      </div>
    </div>
  );
}

export const FsUpdateExtraFilters = memo(FsUpdateExtraFiltersInner);
FsUpdateExtraFilters.displayName = 'FsUpdateExtraFilters';
