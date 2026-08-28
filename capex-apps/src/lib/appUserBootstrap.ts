import type { User } from '@/types';
import type { AppInitPack } from '@/services/appBootstrapApi';
import { formatUserPublicId } from '@/lib/publicUserId';

function hydratePackUser(row: User, sessionUser: Pick<User, 'publicId'> & { id?: number }): User {
  const id = row.id ?? sessionUser.id;
  if (id == null || !Number.isFinite(id)) {
    throw new Error('Cannot hydrate user without resolvable id');
  }
  return {
    ...row,
    id,
    publicId: row.publicId ?? sessionUser.publicId ?? formatUserPublicId(),
  };
}

/** Ambil profil user lengkap (termasuk assignments) dari pack bootstrap. */
export function pickEnrichedUserFromPack(
  pack: AppInitPack,
  sessionUser: Pick<User, 'publicId'> & { id?: number },
): User | null {
  const row =
    pack.users.find(
      (u) =>
        u.publicId === sessionUser.publicId ||
        (sessionUser.id != null && u.id === sessionUser.id),
    ) ?? null;
  if (!row) return null;
  return hydratePackUser(row, sessionUser);
}

/** True jika scope user sudah boleh dipakai untuk filter daftar proyek. */
export function areUserScopesReadyForList(
  currentUser: User,
  dataInitialized: boolean,
  allUsers: User[],
): boolean {
  if ((currentUser.assignments?.length ?? 0) > 0) return true;
  if (!dataInitialized || allUsers.length === 0) return false;
  const full = allUsers.find(
    (u) => u.id === currentUser.id || u.publicId === currentUser.publicId,
  );
  return full != null;
}
