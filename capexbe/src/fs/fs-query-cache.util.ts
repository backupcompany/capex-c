import { createHash } from 'crypto';
import type { FsApprovalQuery, FsRealizationQuery } from './fs-query.dto';
import type { FsUpdateQuery } from '../fs-update/fs-update-query.dto';

function hashParts(parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 20);
}

function scopeKey(scope: { archetypeNames: string[]; huNames: string[] } | null): string {
  if (!scope) return '';
  return `${scope.archetypeNames.slice().sort().join(',')}|${scope.huNames.slice().sort().join(',')}`;
}

/** Filter/sort fingerprint — excludes page & pageSize so pagination reuses the same cache. */
export function buildFsApprovalFilterHash(query: FsApprovalQuery): string {
  return hashParts([
    query.periodName.trim().toLowerCase(),
    query.search.toLowerCase(),
    query.archetypes.slice().sort().join('\0'),
    query.hus.slice().sort().join('\0'),
    query.categories.slice().sort().join('\0'),
    query.paybackMin != null ? String(query.paybackMin) : '',
    query.paybackMax != null ? String(query.paybackMax) : '',
    query.sortBy,
    scopeKey(query.scopeFilter),
  ]);
}

export function buildFsRealizationFilterHash(query: FsRealizationQuery): string {
  return hashParts([
    query.periodName.trim().toLowerCase(),
    query.search.toLowerCase(),
    query.archetypes.slice().sort().join('\0'),
    query.hus.slice().sort().join('\0'),
    query.sortBy,
    scopeKey(query.scopeFilter),
  ]);
}

export function buildFsUpdateFilterHash(query: FsUpdateQuery): string {
  return hashParts([
    query.periodName.trim().toLowerCase(),
    query.search.toLowerCase(),
    query.hus.slice().sort().join('\0'),
    query.sortBy,
    query.showOnlyNotFSApproved ? '1' : '0',
    query.focusNeedingApproval ? '1' : '0',
    query.meetingArchetype ?? '',
    scopeKey(query.scopeFilter),
  ]);
}
