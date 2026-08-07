import React from 'react';
import type { SpreadsheetColumn } from '@/components/organisms/SpreadsheetTable/SpreadsheetTable';
import type { EnrichedFS } from '@/hooks/queries/fetchFsApprovalPageData';

function conclusionColorClass(status: string): string {
  if (status === 'Approved' || status === 'Approved with Notes') return 'text-siloam-green font-medium';
  if (status === 'Pending') return 'text-warning font-medium';
  if (status === 'Rejected') return 'text-danger font-medium';
  return 'text-siloam-text-secondary';
}

export type BuildFsApprovalColumnsParams = {
  canEdit: boolean;
  onEditStatus: (fs: EnrichedFS) => void;
};

export function buildFsApprovalColumns({
  canEdit,
  onEditStatus,
}: BuildFsApprovalColumnsParams): SpreadsheetColumn<EnrichedFS>[] {
  return [
    { header: 'Network', accessor: 'archetypeName' },
    { header: 'Unit', accessor: 'huName' },
    { header: 'Project Name', accessor: 'projectName' },
    { header: 'Capex Category', accessor: 'capexCategoryName' },
    { header: 'New FS / Revision', accessor: 'fsType' },
    { header: 'Amount [Rp mn]', accessor: 'amount', isNumeric: true },
    { header: 'IRR', accessor: (item) => `${item.irr}%` },
    {
      id: 'paybackPeriod',
      header: 'Payback in Month',
      accessor: 'paybackPeriod',
      isNumeric: true,
      numericDisplay: 'plain',
      align: 'right',
    },
    { header: 'NPV [Rp mn]', accessor: 'npv', isNumeric: true },
    { header: 'ROI', accessor: (item) => `${item.roi}%` },
    {
      header: 'Conclusion',
      accessor: (item) => (
        <span className={`px-3 py-2.5 inline-block ${conclusionColorClass(String(item.conclusion))}`}>
          {item.conclusion}
        </span>
      ),
    },
    {
      header: 'Follow Up action',
      accessor: (item) => (
        <span className="px-3 py-2.5 inline-block text-siloam-text-primary">
          {item.followUpAction || '—'}
        </span>
      ),
    },
    {
      header: 'Action',
      accessor: (item) =>
        canEdit ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditStatus(item);
            }}
            className="px-3 py-1 bg-siloam-blue text-white text-xs rounded-lg hover:bg-siloam-blue/90"
          >
            Edit Status
          </button>
        ) : (
          <span className="text-xs text-siloam-text-secondary">View only</span>
        ),
      align: 'center',
    },
  ];
}
