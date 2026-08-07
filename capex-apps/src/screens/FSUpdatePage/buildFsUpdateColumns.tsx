import React from 'react';
import type { SpreadsheetColumn } from '@/components/organisms/SpreadsheetTable/SpreadsheetTable';
import { formatCurrency } from '@/lib/formatter';
import type { FsEnrichedProject } from '@/hooks/queries/fetchFsUpdatePageData';
import {
  type FsEditableProject,
  isFsUpdateSpecialProject,
  resolveFsApproval,
} from './fsUpdateHelpers';

export type BuildFsUpdateColumnsParams = {
  canEdit: boolean;
  canCreateFS: boolean;
  onFsApprovalChange: (projectId: string, isChecked: boolean) => void;
  onViewFS: (project: FsEnrichedProject) => void;
  onCreateFS: (project: FsEnrichedProject) => void;
};

export function buildFsUpdateColumns({
  canEdit,
  canCreateFS,
  onFsApprovalChange,
  onViewFS,
  onCreateFS,
}: BuildFsUpdateColumnsParams): SpreadsheetColumn<FsEditableProject>[] {
  return [
    { header: 'Project Code', accessor: 'projectCode' },
    { header: 'Project Name', accessor: 'projectName' },
    {
      header: 'AX Code',
      accessor: 'axCode',
      isEditable: (item) => canEdit && !isFsUpdateSpecialProject(item),
    },
    {
      header: 'Budget Plan',
      accessor: 'budgetPlan',
      isNumeric: true,
      formatCellDisplay: (value) => formatCurrency(Number(value) || 0),
    },
    {
      header: 'Approved Budget',
      accessor: 'approvedBudget',
      isNumeric: true,
      isEditable: (item) => canEdit && !isFsUpdateSpecialProject(item),
    },
    {
      header: 'Target Budget Start',
      accessor: 'targetBudgetStart',
      isEditable: canEdit,
      editorType: 'date',
    },
    {
      header: 'Budget Revenue Permonth',
      accessor: 'budgetRevenuePermonth',
      isNumeric: true,
      isEditable: canEdit,
    },
    {
      header: 'Assets Not FS Approved',
      accessor: (item) => item.assetsNotFSApprovedCount ?? 0,
      align: 'center',
      numericDisplay: 'plain',
    },
    {
      header: 'FS Status',
      accessor: (item) => item.fsStatus || 'Not Submitted',
      formatCellDisplay: (_, item) => {
        const status = item.fsStatus || 'Not Submitted';
        let statusColorClass = 'text-siloam-text-secondary';
        if (status === 'Approved' || status === 'Approved with Notes') {
          statusColorClass = 'text-siloam-green font-medium';
        } else if (status === 'Pending') {
          statusColorClass = 'text-warning font-medium';
        } else if (status === 'Rejected') {
          statusColorClass = 'text-danger font-medium';
        }
        return <span className={statusColorClass}>{status}</span>;
      },
    },
    {
      header: 'FS Action',
      accessor: (item) => item.id,
      align: 'center',
      formatCellDisplay: (_, project) => {
        const status = project.fsStatus || 'Not Submitted';
        if (isFsUpdateSpecialProject(project)) {
          return <span className="text-xs text-siloam-text-secondary">N/A</span>;
        }
        if (status === 'Not Submitted') {
          return canCreateFS ? (
            <button
              type="button"
              onClick={() => onCreateFS(project)}
              className="px-3 py-1 bg-siloam-blue text-white text-xs rounded-lg hover:bg-siloam-blue/90"
            >
              Create FS
            </button>
          ) : (
            <span className="text-xs text-siloam-text-secondary">View only</span>
          );
        }
        return (
          <button
            type="button"
            onClick={() => void onViewFS(project)}
            className="px-3 py-1 border border-siloam-border text-siloam-text-primary text-xs rounded-lg hover:bg-siloam-bg"
          >
            View FS
          </button>
        );
      },
    },
    {
      header: 'FS Approval',
      accessor: (item) => resolveFsApproval(item),
      align: 'center',
      formatCellDisplay: (_, project) => (
        <div className="flex justify-center items-center h-full px-4 py-3">
          <input
            type="checkbox"
            checked={resolveFsApproval(project)}
            onChange={(e) => onFsApprovalChange(project.id, e.target.checked)}
            disabled={!canEdit || isFsUpdateSpecialProject(project)}
            className="h-5 w-5 text-siloam-blue rounded border-gray-300 focus:ring-siloam-blue disabled:opacity-50"
            title="FS Approval - Check when FS is approved"
          />
        </div>
      ),
    },
  ];
}
