import React, { memo } from 'react';
import type { Notification } from '@/types';
import { Page } from '@/types';
import { NotificationBell } from '../../molecules/NotificationBell/NotificationBell';

export type HeaderNotificationShellProps = {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onNavigate: (page: Page) => void;
};

export const HeaderNotificationShell = memo(function HeaderNotificationShell({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onNavigate,
}: HeaderNotificationShellProps) {
  return (
    <NotificationBell
      notifications={notifications}
      onMarkAsRead={onMarkAsRead}
      onMarkAllAsRead={onMarkAllAsRead}
      onNavigate={onNavigate}
    />
  );
});

HeaderNotificationShell.displayName = 'HeaderNotificationShell';
