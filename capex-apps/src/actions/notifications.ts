/** @deprecated Prefer notificationService via BFF — identity from JWT, no userId in body. */
'use server';

import { proxyBePost } from '@/lib/auth/beProxy';

/** @deprecated Prefer notificationService.markNotificationAsRead via BFF. */
export async function markNotificationReadAction(
  notificationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await proxyBePost(
    '/notifications/mark-read',
    JSON.stringify({ notificationId }),
    null,
  );
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || 'Failed to mark notification read' };
  }
  return { ok: true };
}

/** @deprecated Prefer notificationService.markAllNotificationsAsRead via BFF. */
export async function markAllNotificationsReadAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await proxyBePost('/notifications/mark-all-read', JSON.stringify({}), null);
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || 'Failed to mark all notifications read' };
  }
  return { ok: true };
}
