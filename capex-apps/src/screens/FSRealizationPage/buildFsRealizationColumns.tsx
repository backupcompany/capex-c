import React from 'react';
import type { SpreadsheetColumn } from '@/components/organisms/SpreadsheetTable/SpreadsheetTable';
import { formatCurrency } from '@/lib/formatter';
import type { EnrichedFS } from '@/hooks/queries/fetchFsRealizationPageData';
import { toFsApprovedBudgetIdr } from './fsRealizationHelpers';

export type BuildFsRealizationColumnsParams = {
  canEdit: boolean;
  isModalLoading: boolean;
  selectedFsId: string | null;
  onOpenModal: (fs: EnrichedFS) => void;
};

export function buildFsRealizationColumns({
  canEdit,
  isModalLoading,
  selectedFsId,
  onOpenModal,
}: BuildFsRealizationColumnsParams): SpreadsheetColumn<EnrichedFS>[] {
  return [
    { header: 'Network', accessor: 'archetypeName' },
    { header: 'Unit', accessor: 'huName' },
    { header: 'Project Name', accessor: 'projectName' },
    { header: 'Capex Category', accessor: 'capexCategoryName' },
    { header: 'FS Type', accessor: 'fsType' },
    {
      header: 'Approved Budget',
      accessor: (item) => formatCurrency(toFsApprovedBudgetIdr(item.amount)),
      isNumeric: true,
    },
    { header: 'Plan Revenue Start', accessor: 'plannedRevenueStartDate' },
    { header: 'Actual Revenue Start', accessor: (item) => item.actualRevenueStartDate || 'Not Set' },
    {
      header: 'Monthly Revenue Plan',
      accessor: (item) => formatCurrency(item.monthlyRevenuePlan),
      isNumeric: true,
    },
    {
      header: 'Action',
      accessor: (item) => (
        <button
          type="button"
          onClick={() => void onOpenModal(item)}
          disabled={isModalLoading && selectedFsId === item.id}
          className="px-3 py-1 bg-siloam-blue text-white text-xs rounded-lg hover:bg-siloam-blue/90 disabled:opacity-50"
        >
          {canEdit ? 'Update Realization' : 'View Realization'}
        </button>
      ),
    },
  ];
}
