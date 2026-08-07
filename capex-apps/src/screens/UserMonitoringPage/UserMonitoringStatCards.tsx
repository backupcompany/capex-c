import React, { memo } from 'react';

type StatCardProps = {
  title: string;
  value: string | number;
  hint?: string;
  accentClass: string;
  isLoading?: boolean;
};

function StatCard({ title, value, hint, accentClass, isLoading = false }: StatCardProps) {
  return (
    <div className="bg-siloam-surface p-5 rounded-xl shadow-soft border border-siloam-border">
      <p className="text-sm text-siloam-text-secondary">{title}</p>
      {isLoading ? (
        <div className="mt-2 h-9 w-16 animate-pulse rounded bg-siloam-border/60" />
      ) : (
        <p className={`text-3xl font-bold mt-1 tabular-nums ${accentClass}`}>{value}</p>
      )}
      {hint ? <p className="text-xs text-siloam-text-secondary mt-1">{hint}</p> : null}
    </div>
  );
}

type UserMonitoringStatCardsProps = {
  summary: {
    totalUsers: number;
    onlineNow: number;
    activeUsers: number;
    dormantUsers: number;
    inactiveUsers: number;
  };
  isLoading?: boolean;
};

function UserMonitoringStatCardsInner({ summary, isLoading = false }: UserMonitoringStatCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" aria-busy={isLoading}>
      <StatCard title="Total Pengguna" value={summary.totalUsers} accentClass="text-siloam-blue" isLoading={isLoading} />
      <StatCard
        title="Sedang Online"
        value={summary.onlineNow}
        hint="Aktif dalam 15 menit terakhir"
        accentClass="text-emerald-600"
        isLoading={isLoading}
      />
      <StatCard
        title="Aktif (30 Hari)"
        value={summary.activeUsers}
        accentClass="text-siloam-green"
        isLoading={isLoading}
      />
      <StatCard title="Dormant" value={summary.dormantUsers} accentClass="text-yellow-700" isLoading={isLoading} />
      <StatCard title="Inactive" value={summary.inactiveUsers} accentClass="text-danger" isLoading={isLoading} />
    </div>
  );
}

export const UserMonitoringStatCards = memo(UserMonitoringStatCardsInner);
UserMonitoringStatCards.displayName = 'UserMonitoringStatCards';
