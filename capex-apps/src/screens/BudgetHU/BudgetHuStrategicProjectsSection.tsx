import React, { memo, useCallback } from 'react';
import type { Project, ProjectPriorityConfig, BudgetCategoryConfig } from '@/types';
import { SpreadsheetTable, SpreadsheetColumn } from '@/components/organisms/SpreadsheetTable/SpreadsheetTable';
import { ProjectCard } from '@/components/molecules/ProjectCard/ProjectCard';
import { Spinner } from '@/components/atoms/Spinner/Spinner';
import { BudgetHuColumnSelector } from './BudgetHuColumnSelector';
import { TABLE_PAGE_SIZE_OPTIONS } from '@/lib/table/pageSizeOptions';
import type { BudgetHuTableColumnId } from './budgetHuTableColumnIds';

export type BudgetHuStrategicProjectsSectionProps = {
  huKey: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  paginatedProjects: Project[];
  tableProjects: Project[];
  filteredCount: number;
  currentPage: number;
  itemsPerPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
  projectColumns: SpreadsheetColumn<Project>[];
  onDataChange: (newData: Project[]) => void;
  canCreateProject: boolean;
  onAddProject: () => void;
  onBulkManage: () => void;
  onEditProject: (project: Project) => void;
  allCategories: BudgetCategoryConfig[];
  allPriorities: ProjectPriorityConfig[];
  visibleColumnIds: Set<BudgetHuTableColumnId>;
  onToggleColumn: (id: BudgetHuTableColumnId) => void;
  onResetColumns: () => void;
  onShowAllColumns: () => void;
  onExportExcel: () => void;
  isExporting?: boolean;
  /** Server fetch in progress (search, pagination, HU filter). */
  isTableLoading?: boolean;
  /** Search typed but debounce not applied yet. */
  isSearchPending?: boolean;
};

type BudgetHuProjectsTableProps = {
  huKey: string;
  columns: SpreadsheetColumn<Project>[];
  rows: Project[];
  onDataChange: (newData: Project[]) => void;
};

const BudgetHuProjectsTable = memo(function BudgetHuProjectsTable({
  huKey,
  columns,
  rows,
  onDataChange,
}: BudgetHuProjectsTableProps) {
  return (
    <div className="hidden md:block">
      <SpreadsheetTable
        key={huKey}
        columns={columns}
        data={rows}
        onDataChange={onDataChange}
        rowHeaderAccessor="projectName"
        maxHeight="min(70vh, 720px)"
        virtualizeRows="auto"
      />
    </div>
  );
});

type BudgetHuProjectsMobileListProps = {
  huKey: string;
  rows: Project[];
  searchTerm: string;
  allCategories: BudgetCategoryConfig[];
  allPriorities: ProjectPriorityConfig[];
  onEditProject: (project: Project) => void;
};

const BudgetHuProjectsMobileList = memo(function BudgetHuProjectsMobileList({
  huKey,
  rows,
  searchTerm,
  allCategories,
  allPriorities,
  onEditProject,
}: BudgetHuProjectsMobileListProps) {
  return (
    <div className="md:hidden space-y-4" key={huKey}>
      {rows.map((project) => {
          const categoryName = allCategories.find((c) => c.id === project.budgetCategoryId)?.name || 'N/A';
          const priorityName = allPriorities.find((p) => p.id === project.priorityId)?.name || 'N/A';
          return (
            <ProjectCard
              key={project.id}
              project={project}
              categoryName={categoryName}
              priorityName={priorityName}
              onEditClick={() => onEditProject(project)}
            />
          );
        })}
    </div>
  );
});

export const BudgetHuStrategicProjectsSection = memo(function BudgetHuStrategicProjectsSection({
  huKey,
  searchTerm,
  onSearchChange,
  onClearSearch,
  paginatedProjects,
  tableProjects,
  filteredCount,
  currentPage,
  itemsPerPage,
  totalPages,
  onPageChange,
  onItemsPerPageChange,
  projectColumns,
  onDataChange,
  canCreateProject,
  onAddProject,
  onBulkManage,
  onEditProject,
  allCategories,
  allPriorities,
  visibleColumnIds,
  onToggleColumn,
  onResetColumns,
  onShowAllColumns,
  onExportExcel,
  isExporting = false,
  isTableLoading = false,
  isSearchPending = false,
}: BudgetHuStrategicProjectsSectionProps) {
  const handleSearchInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value),
    [onSearchChange],
  );

  const showTableBusy = isTableLoading || isSearchPending;
  const rangeStart = filteredCount > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const rangeEnd = Math.min(currentPage * itemsPerPage, filteredCount);

  return (
    <div
      data-tour="budget-hu-projects-section"
      className="bg-siloam-surface p-6 rounded-xl shadow-soft space-y-4"
    >
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-xl font-bold">Strategic & Special Projects</h2>
        <div data-tour="budget-hu-project-actions" className="flex items-center gap-2 flex-wrap">
          <BudgetHuColumnSelector
            visibleIds={visibleColumnIds}
            onToggle={onToggleColumn}
            onReset={onResetColumns}
            onShowAll={onShowAllColumns}
          />
          {canCreateProject && (
            <>
              <button
                type="button"
                onClick={onAddProject}
                className="bg-siloam-blue text-white px-4 py-2 rounded-xl text-sm hover:bg-siloam-blue/90 transition shadow-soft"
              >
                + New Project
              </button>
              <button
                type="button"
                onClick={onBulkManage}
                className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-purple-700 transition shadow-soft"
              >
                Bulk Manage Projects
              </button>
            </>
          )}
        </div>
      </div>

      <div className="pb-4 border-b border-siloam-border">
        <div className="relative max-w-md" data-tour="budget-hu-search">
          <input
            type="text"
            placeholder="Cari project dan asset berdasarkan kode, nama, atau kategori..."
            value={searchTerm}
            onChange={handleSearchInput}
            aria-busy={showTableBusy}
            className="w-full px-4 py-2 pl-10 pr-10 border border-siloam-border rounded-lg bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue text-sm"
          />
          <svg
            className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-siloam-text-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {showTableBusy ? (
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-siloam-blue"
              aria-label="Memuat data"
            >
              <Spinner size={16} className="text-siloam-blue" />
            </span>
          ) : searchTerm ? (
            <button
              type="button"
              onClick={onClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-siloam-text-secondary hover:text-siloam-text-primary"
              aria-label="Clear search"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-[12rem]" aria-busy={showTableBusy}>
        {showTableBusy ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-siloam-surface/70 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border border-siloam-border bg-siloam-surface px-4 py-2 text-sm text-siloam-text-secondary shadow-soft">
              <Spinner size={18} className="text-siloam-blue" />
              <span>{isSearchPending && !isTableLoading ? 'Mencari…' : 'Memuat data terbaru…'}</span>
            </div>
          </div>
        ) : null}
        {!showTableBusy && tableProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <p className="text-sm font-medium text-siloam-text-primary">
              {searchTerm.trim()
                ? 'Tidak ada project yang cocok'
                : 'Belum ada strategic project'}
            </p>
            <p className="text-sm text-siloam-text-secondary mt-1 max-w-md">
              {searchTerm.trim()
                ? `Pencarian "${searchTerm.trim()}" tidak menemukan project atau asset. Coba kata kunci lain atau hapus filter.`
                : 'Unit hospital ini belum memiliki strategic & special project.'}
            </p>
            {searchTerm.trim() ? (
              <button
                type="button"
                onClick={onClearSearch}
                className="mt-4 text-sm font-semibold text-siloam-blue hover:underline"
              >
                Hapus pencarian
              </button>
            ) : null}
          </div>
        ) : tableProjects.length > 0 ? (
          <div className={showTableBusy ? 'opacity-50 pointer-events-none select-none' : undefined}>
            <BudgetHuProjectsTable
              huKey={huKey}
              columns={projectColumns}
              rows={tableProjects}
              onDataChange={onDataChange}
            />

            <BudgetHuProjectsMobileList
              huKey={huKey}
              rows={tableProjects}
              searchTerm={searchTerm}
              allCategories={allCategories}
              allPriorities={allPriorities}
              onEditProject={onEditProject}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-siloam-border">
        <div className="flex items-center gap-3">
          <div className="text-sm text-siloam-text-secondary">
            Showing {rangeStart} - {rangeEnd} dari {filteredCount} project
            {isTableLoading ? (
              <span className="ml-2 text-xs text-siloam-blue">· Memperbarui…</span>
            ) : null}
          </div>
          <button
            type="button"
            data-tour="budget-hu-export"
            onClick={onExportExcel}
            disabled={isExporting}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            title="Export semua project HU ini (data lengkap dari server)"
          >
            {isExporting ? 'Menyiapkan…' : 'Export Excel'}
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-siloam-text-secondary">Per page:</label>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="px-2 py-1 border border-siloam-border rounded bg-siloam-bg text-sm focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            >
              {TABLE_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg hover:bg-siloam-surface disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => onPageChange(pageNum)}
                      className={`px-3 py-1 border rounded text-sm ${
                        currentPage === pageNum
                          ? 'bg-siloam-blue text-white border-siloam-blue'
                          : 'border-siloam-border bg-siloam-bg hover:bg-siloam-surface'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg hover:bg-siloam-surface disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});
