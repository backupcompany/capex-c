import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DailyMOMSummaryRow, User, UserRole } from '../types';
import { Page } from '../types';
import * as taskService from '../services/taskService';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../contexts/ToastContext';
import { queryKeys } from '../lib/query-keys';

interface MomDailySummaryPageProps {
  currentUser: User | null;
  allRoles: UserRole[];
  periodName: string;
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function localDateInputValue(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftLocalDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(y, m - 1, d);
  next.setDate(next.getDate() + days);
  return localDateInputValue(next);
}

function formatSummaryDateLabel(iso: string): string {
  try {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function rowToPlainText(r: DailyMOMSummaryRow): string {
  return [
    `Project: ${r.projectName} (${r.projectCode})`,
    `Asset: ${r.assetName} (${r.assetCode})`,
    `Oleh: ${r.mom.createdByUsername}`,
    `Waktu: ${formatDateTime(r.mom.createdAt)}`,
    '',
    r.mom.content.trim(),
  ].join('\n');
}

const TABLE_SKELETON_ROWS = 5;

function MomTableSkeleton() {
  return (
    <>
      {Array.from({ length: TABLE_SKELETON_ROWS }).map((_, i) => (
        <tr key={i} className="border-b border-siloam-border/80 animate-pulse">
          {Array.from({ length: 7 }).map((__, j) => (
            <td key={j} className="px-4 py-3 align-top">
              <div className="h-4 bg-siloam-border/50 rounded w-full max-w-[120px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export const MomDailySummaryPage: React.FC<MomDailySummaryPageProps> = ({
  currentUser,
  allRoles,
  periodName,
}) => {
  const { showToast } = useToast();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.DailyMOMSummary, 'view');
  const [summaryDate, setSummaryDate] = useState(() => localDateInputValue());
  const [selectedMomId, setSelectedMomId] = useState<string | null>(null);
  const scopesKey = useMemo(() => JSON.stringify(permissions.userScopes ?? []), [permissions.userScopes]);

  const queryEnabled = Boolean(currentUser && periodName.trim() && canView && summaryDate.trim());
  const todayIso = localDateInputValue();
  const yesterdayIso = shiftLocalDate(todayIso, -1);

  const {
    data: rows = [],
    isPending,
    isFetching,
    isSuccess,
    refetch,
  } = useQuery({
    queryKey: queryKeys.momDailySummary.rows(
      currentUser?.id ?? 0,
      periodName,
      summaryDate,
      scopesKey,
    ),
    queryFn: async () => {
      if (!currentUser || !periodName.trim() || !summaryDate.trim()) return [];
      try {
        return await taskService.getDailyMOMSummaryRows(
          periodName,
          summaryDate,
          permissions.userScopes,
          currentUser.id,
        );
      } catch (e) {
        console.error(e);
        showToast('Gagal memuat ringkasan MOM.', 'error', { title: 'Daily MOM Summary' });
        return [];
      }
    },
    enabled: queryEnabled,
    staleTime: 120_000,
  });

  const isIdle = !summaryDate.trim();
  const loading = queryEnabled && isPending;
  const refreshing = queryEnabled && isFetching && !isPending;
  const hasLoaded = queryEnabled && isSuccess && !loading;

  const handleDateChange = useCallback((value: string) => {
    setSummaryDate(value.trim() || localDateInputValue());
    setSelectedMomId(null);
  }, []);

  const pickToday = useCallback(() => handleDateChange(todayIso), [handleDateChange, todayIso]);
  const pickYesterday = useCallback(
    () => handleDateChange(yesterdayIso),
    [handleDateChange, yesterdayIso],
  );

  const toggleRowSelect = useCallback((momId: string) => {
    setSelectedMomId((prev) => (prev === momId ? null : momId));
  }, []);

  const uniqueProjects = useMemo(
    () => (hasLoaded ? new Set(rows.map((r) => r.projectCode)).size : 0),
    [hasLoaded, rows],
  );

  const copyAllMOMText = useCallback(async () => {
    if (!hasLoaded || rows.length === 0) {
      showToast('Tidak ada MOM untuk disalin.', 'error');
      return;
    }
    const header = `Ringkasan MOM — ${summaryDate} — Periode: ${periodName}\nTotal entri: ${rows.length}\n\n---\n\n`;
    const body = rows.map((r, i) => `### ${i + 1}\n${rowToPlainText(r)}`).join('\n\n---\n\n');
    try {
      await navigator.clipboard.writeText(header + body);
      showToast('Semua MOM disalin ke clipboard.', 'success');
    } catch {
      showToast('Clipboard tidak tersedia.', 'error');
    }
  }, [hasLoaded, rows, summaryDate, periodName, showToast]);

  const copyOne = useCallback(
    async (r: DailyMOMSummaryRow) => {
      try {
        await navigator.clipboard.writeText(rowToPlainText(r));
        showToast('MOM disalin.', 'success');
      } catch {
        showToast('Clipboard tidak tersedia.', 'error');
      }
    },
    [showToast],
  );

  const exportExcel = useCallback(async () => {
    if (!hasLoaded || rows.length === 0) {
      showToast('Tidak ada data untuk diekspor.', 'error');
      return;
    }
    const XLSX = await import('xlsx');
    const sheetData = rows.map((r) => ({
      TanggalWaktu: formatDateTime(r.mom.createdAt),
      KodeProject: r.projectCode,
      NamaProject: r.projectName,
      KodeAsset: r.assetCode,
      NamaAsset: r.assetName,
      Network: r.archetypeName,
      HU: r.huName,
      DibuatOleh: r.mom.createdByUsername,
      MOM: r.mom.content,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, 'MOM Harian');
    const safeDate = summaryDate.replace(/-/g, '');
    XLSX.writeFile(wb, `mom-harian-${safeDate}-${periodName.replace(/\s+/g, '_')}.xlsx`);
    showToast('Excel berhasil diunduh.', 'success');
  }, [hasLoaded, rows, summaryDate, periodName, showToast]);

  if (!currentUser) {
    return (
      <div className="text-siloam-text-secondary text-sm">Silakan login untuk melihat ringkasan MOM.</div>
    );
  }

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>
    );
  }

  const dateChipClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      active
        ? 'bg-siloam-blue text-white'
        : 'border border-siloam-border bg-white text-siloam-text-primary hover:bg-siloam-surface'
    }`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-siloam-text-primary">Daily MOM Summary</h1>
        <p className="mt-1 text-sm text-siloam-text-secondary max-w-3xl">
          Lihat semua catatan MOM (Minutes of Meeting) yang dibuat pada satu hari, untuk proyek di periode
          anggaran aktif{periodName ? `: ${periodName}` : ''}. Ganti tanggal untuk melihat hari lain.
        </p>
      </div>

      <div className="rounded-xl border border-siloam-border bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-siloam-text-primary">Pilih tanggal</p>
              <p className="text-xs text-siloam-text-secondary mt-0.5">
                Data dimuat otomatis saat tanggal berubah.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="mom-summary-date"
                type="date"
                value={summaryDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="rounded-xl border border-siloam-border bg-siloam-surface px-3 py-2 text-siloam-text-primary focus:outline-none focus:ring-2 focus:ring-siloam-blue"
              />
              <button type="button" onClick={pickToday} className={dateChipClass(summaryDate === todayIso)}>
                Hari ini
              </button>
              <button
                type="button"
                onClick={pickYesterday}
                className={dateChipClass(summaryDate === yesterdayIso)}
              >
                Kemarin
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={!queryEnabled || loading}
              className="rounded-xl border border-siloam-border bg-white px-4 py-2 text-sm font-medium text-siloam-text-primary hover:bg-siloam-surface disabled:opacity-50"
            >
              {loading ? 'Memuat…' : refreshing ? 'Memuat ulang…' : 'Segarkan'}
            </button>
            <button
              type="button"
              onClick={() => void copyAllMOMText()}
              disabled={!hasLoaded || rows.length === 0}
              className="rounded-xl border border-siloam-border bg-white px-4 py-2 text-sm font-medium text-siloam-text-primary hover:bg-siloam-surface disabled:opacity-50"
            >
              Salin semua MOM
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={!hasLoaded || rows.length === 0}
              className="rounded-xl border border-siloam-border bg-white px-4 py-2 text-sm font-medium text-siloam-text-primary hover:bg-siloam-surface disabled:opacity-50"
            >
              Ekspor Excel
            </button>
          </div>
        </div>

        {!isIdle ? (
          <div className="rounded-lg bg-siloam-surface/80 px-4 py-3 text-sm text-siloam-text-secondary border border-siloam-border/60">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-siloam-blue border-t-transparent" />
                Memuat MOM untuk {formatSummaryDateLabel(summaryDate)}…
              </span>
            ) : hasLoaded && rows.length === 0 ? (
              <>
                <span className="font-medium text-siloam-text-primary">0 catatan</span>
                {' · '}
                Tidak ada MOM pada {formatSummaryDateLabel(summaryDate)} untuk cakupan Anda.
              </>
            ) : hasLoaded ? (
              <>
                <span className="font-medium text-siloam-text-primary">
                  {rows.length} catatan MOM
                </span>
                {' · '}
                {formatSummaryDateLabel(summaryDate)}
                {uniqueProjects > 0 ? ` · ${uniqueProjects} project` : ''}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-siloam-border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">Total MOM</p>
          <p className="mt-1 text-2xl font-bold text-siloam-text-primary">
            {isIdle ? '—' : loading ? '…' : rows.length}
          </p>
        </div>
        <div className="rounded-xl border border-siloam-border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">Project (unik)</p>
          <p className="mt-1 text-2xl font-bold text-siloam-text-primary">
            {isIdle ? '—' : loading ? '…' : uniqueProjects}
          </p>
        </div>
        <div className="rounded-xl border border-siloam-border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">Periode</p>
          <p className="mt-1 text-lg font-semibold text-siloam-text-primary truncate" title={periodName}>
            {periodName || '—'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-siloam-border bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-siloam-surface border-b border-siloam-border text-left text-siloam-text-secondary">
                <th className="px-4 py-3 font-medium whitespace-nowrap">Waktu</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Kode asset</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Nama project</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Nama asset</th>
                <th className="px-4 py-3 font-medium">MOM</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Oleh</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isIdle && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-siloam-text-secondary">
                    Pilih tanggal untuk menampilkan ringkasan MOM.
                  </td>
                </tr>
              )}
              {loading && <MomTableSkeleton />}
              {!isIdle && !loading && hasLoaded && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <p className="font-medium text-siloam-text-primary">Tidak ada MOM pada tanggal ini</p>
                    <p className="mt-1 text-sm text-siloam-text-secondary max-w-md mx-auto">
                      Belum ada catatan MOM yang dibuat pada {formatSummaryDateLabel(summaryDate)} untuk
                      proyek dalam cakupan Anda.
                    </p>
                  </td>
                </tr>
              )}
              {!isIdle &&
                !loading &&
                hasLoaded &&
                rows.map((r) => {
                  const isSelected = selectedMomId === r.mom.id;
                  const isDimmed = selectedMomId != null && !isSelected;
                  return (
                    <tr
                      key={r.mom.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleRowSelect(r.mom.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleRowSelect(r.mom.id);
                        }
                      }}
                      className={`border-b border-siloam-border/80 cursor-pointer transition-all duration-150 ${
                        isSelected
                          ? 'bg-siloam-blue/10 ring-1 ring-inset ring-siloam-blue/30'
                          : 'hover:bg-siloam-surface/50'
                      } ${isDimmed ? 'opacity-40' : 'opacity-100'}`}
                    >
                      <td className="px-4 py-3 text-siloam-text-secondary whitespace-nowrap align-top">
                        {formatDateTime(r.mom.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs align-top">{r.assetCode || '—'}</td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-siloam-text-primary">{r.projectName || '—'}</div>
                        <div className="text-xs text-siloam-text-secondary">{r.projectCode}</div>
                      </td>
                      <td className="px-4 py-3 align-top">{r.assetName || '—'}</td>
                      <td className="px-4 py-3 text-siloam-text-primary align-top max-w-md">
                        <p className="whitespace-pre-wrap break-words">{r.mom.content}</p>
                      </td>
                      <td className="px-4 py-3 text-siloam-text-secondary align-top whitespace-nowrap">
                        {r.mom.createdByUsername}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void copyOne(r);
                          }}
                          className="text-siloam-blue text-sm font-medium hover:underline"
                        >
                          Salin
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
