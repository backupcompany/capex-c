import React from 'react';
import type { Column } from '@/components/organisms/GenericTable/GenericTable';
import type { UserActivityMetric } from '@/types';
import {
  formatInactiveDuration,
  formatLastActive,
  formatScopePreview,
  parseRoleNames,
  sortRoleNames,
} from './userMonitoringFormatters';

function RoleBadges({ roles }: { roles: string[] }) {
  if (roles.length === 0) {
    return <span className="text-xs text-siloam-text-secondary">—</span>;
  }
  return (
    <div className="flex flex-col gap-1 min-w-[7.5rem]">
      {roles.map((role) => (
        <span
          key={role}
          className="inline-flex w-fit max-w-full items-center rounded-md bg-siloam-blue/10 px-2 py-0.5 text-xs font-semibold text-siloam-blue leading-snug"
          title={role}
        >
          <span className="truncate">{role}</span>
        </span>
      ))}
    </div>
  );
}

function ScopeCell({ names }: { names: string[] }) {
  const { label, title } = formatScopePreview(names, 2);
  return (
    <span className="block text-xs text-siloam-text-secondary leading-relaxed" title={title}>
      {label}
    </span>
  );
}

export function buildUserMonitoringColumns(
  liveNowMs: number,
  roleCatalogOrder: string[] = [],
): Column<UserActivityMetric>[] {
  return [
    {
      header: 'Pengguna',
      width: '20%',
      accessor: (user) => (
        <div className="flex items-start gap-2 min-w-0">
          {user.isOnline ? (
            <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" title="Sedang online" />
          ) : (
            <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-siloam-border shrink-0" title="Offline" />
          )}
          <div className="min-w-0">
            <p className="font-semibold text-siloam-text-primary truncate">{user.username}</p>
            <p className="text-xs text-siloam-text-secondary truncate">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Role',
      width: '13%',
      accessor: (user) => (
        <RoleBadges roles={sortRoleNames(parseRoleNames(user.roleName), roleCatalogOrder)} />
      ),
    },
    {
      header: 'Scope Network',
      width: '17%',
      accessor: (user) => <ScopeCell names={user.archetypeNames ?? []} />,
    },
    {
      header: 'Scope Unit',
      width: '17%',
      accessor: (user) => <ScopeCell names={user.unitNames ?? []} />,
    },
    {
      header: 'Status',
      width: '10%',
      accessor: (user) => {
        const color = user.isOnline
          ? 'bg-emerald-100 text-emerald-700'
          : user.status === 'Active'
            ? 'bg-siloam-green/10 text-siloam-green'
            : user.status === 'Dormant'
              ? 'bg-warning/10 text-yellow-700'
              : 'bg-gray-100 text-gray-500';
        const label = user.isOnline ? 'Online' : user.status;
        return (
          <span className={`inline-flex px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${color}`}>
            {label}
          </span>
        );
      },
    },
    {
      header: 'Terakhir Aktif',
      width: '12%',
      accessor: (user) => (
        <span className="text-xs whitespace-nowrap">{formatLastActive(user.lastActiveAt, user.isOnline)}</span>
      ),
    },
    {
      header: 'Durasi Nonaktif',
      width: '11%',
      accessor: (user) => (
        <span className="text-xs whitespace-nowrap">
          {formatInactiveDuration(user.lastActiveAt, user.isOnline, liveNowMs)}
        </span>
      ),
    },
  ];
}
