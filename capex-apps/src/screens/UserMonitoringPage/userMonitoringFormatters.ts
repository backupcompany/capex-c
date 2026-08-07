export function formatLastActive(value: string | null, isOnline?: boolean): string {
  if (isOnline) return 'Sedang aktif';
  if (!value) return 'Belum pernah';
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatInactiveDuration(
  value: string | null,
  isOnline?: boolean,
  nowMs = Date.now(),
): string {
  if (isOnline) return '—';
  if (!value) return '-';
  const diff = nowMs - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days} hari lalu`;
  if (hours > 0) return `${hours} jam lalu`;
  if (minutes > 0) return `${minutes} menit lalu`;
  return 'Baru saja';
}

export function normalizeUserMonitoringSearch(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

const ROLE_PRIORITY: Record<string, number> = {
  'Super Admin': 0,
  'System Admin': 1,
};

export function parseRoleNames(roleName: string | null | undefined): string[] {
  if (!roleName?.trim() || roleName.trim() === 'N/A') return [];
  return [...new Set(roleName.split(',').map((r) => r.trim()).filter(Boolean))];
}

/** Sort roles: known hierarchy first, then alphabetical (id locale). */
export function sortRoleNames(
  roles: string[],
  catalogOrder: string[] = [],
): string[] {
  const rank = new Map<string, number>();
  catalogOrder.forEach((name, i) => rank.set(name, i));
  return [...roles].sort((a, b) => {
    const pa = rank.has(a) ? rank.get(a)! : ROLE_PRIORITY[a] ?? 100 + a.length;
    const pb = rank.has(b) ? rank.get(b)! : ROLE_PRIORITY[b] ?? 100 + b.length;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b, 'id');
  });
}

export function formatScopePreview(names: string[], maxVisible = 2): { label: string; title?: string } {
  if (!names.length) return { label: '—' };
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'id'));
  const full = sorted.join(', ');
  if (sorted.length <= maxVisible) return { label: full, title: full };
  return {
    label: `${sorted.slice(0, maxVisible).join(', ')} +${sorted.length - maxVisible}`,
    title: full,
  };
}
