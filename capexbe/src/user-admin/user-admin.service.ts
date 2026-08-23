import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { AuthZService } from '../auth/auth-z.service';
import { fetchAllRecords } from '../project-list/supabase-helpers';
import { isPasswordLoginEnabledInMode } from '../shared/auth-mode.util';
import { USER_DIRECTORY_COLUMNS } from '../shared/response-sanitize.util';
import {
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';
import { escapeIlikePattern } from '../shared/postgrest-filter.util';
import { collectEmailsFromWorkbook, readWorkbookFromUpload } from './office-email-parse';

export type OfficeDiffUserRow = { id: number; email: string; username: string };

function randomInitialPassword(): string {
  return randomBytes(24).toString('base64url');
}

export type SyncUsersToAuthResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  message: string;
};

@Injectable()
export class UserAdminService {
  constructor(private readonly authZ: AuthZService) {}

  private async adminClient(accessToken: string, appUserId: number): Promise<SupabaseClient> {
    const ctx = await this.authZ.assertAnyRole(accessToken, appUserId, ['super_admin']);
    return ctx.client;
  }

  private async pmoOrAdminClient(accessToken: string, appUserId: number): Promise<SupabaseClient> {
    const ctx = await this.authZ.assertAnyRole(accessToken, appUserId, ['super_admin', 'pmo']);
    return ctx.client;
  }

  async compareOfficeList(
    accessToken: string,
    appUserId: number,
    file: { buffer: Buffer; originalname: string },
  ): Promise<{ officeEmailCount: number; filename: string; notInOffice: OfficeDiffUserRow[] }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing or empty file');
    }
    const wb = readWorkbookFromUpload(file.buffer, file.originalname || 'upload');
    const officeEmails = collectEmailsFromWorkbook(wb);
    if (officeEmails.size === 0) {
      throw new BadRequestException('No email addresses found in the uploaded file');
    }

    const client = await this.pmoOrAdminClient(accessToken, appUserId);
    const rows = await fetchAllRecords(client, 'users', USER_DIRECTORY_COLUMNS);
    const notInOffice: OfficeDiffUserRow[] = rows
      .map((u: { id?: unknown; email?: unknown; username?: unknown }) => ({
        id: Number(u.id),
        email: String(u.email ?? ''),
        username: String(u.username ?? ''),
      }))
      .filter((u) => Number.isFinite(u.id))
      .filter((u) => {
        const e = u.email.trim().toLowerCase();
        if (!e) return true;
        return !officeEmails.has(e);
      });

    return {
      officeEmailCount: officeEmails.size,
      filename: file.originalname || 'upload',
      notInOffice,
    };
  }

  async bulkDeleteUsers(accessToken: string, appUserId: number, ids: number[]): Promise<{ deleted: number }> {
    const unique = [...new Set(ids.map((x) => Number(x)))].filter((n) => Number.isFinite(n) && n > 0);
    if (!unique.length) {
      throw new BadRequestException('No valid user ids to delete');
    }
    if (unique.includes(Number(appUserId))) {
      throw new BadRequestException('Cannot delete your own user account');
    }

    const client = await this.adminClient(accessToken, appUserId);
    const { error } = await client.from('users').delete().in('id', unique);
    if (error) {
      throw new BadRequestException(error.message);
    }
    return { deleted: unique.length };
  }

  async syncUsersToAuth(
    accessToken: string,
    appUserId: number,
  ): Promise<SyncUsersToAuthResult> {
    if (!isPasswordLoginEnabledInMode()) {
      throw new BadRequestException(
        'Password Auth sync disabled (CAPEX_AUTH_MODE=sso). Users sign in with Microsoft SSO after being registered in public.users.',
      );
    }
    await this.adminClient(accessToken, appUserId);

    const serviceKey = getSupabaseServiceKey();
    if (!serviceKey) {
      throw new BadRequestException('SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    const admin = createSupabaseClient(serviceKey);
    const { data: appUsers, error: fetchError } = await admin
      .from('users')
      .select('id, username, email, auth_id');

    if (fetchError) {
      throw new BadRequestException(fetchError.message);
    }

    if (!appUsers?.length) {
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        message: 'No users in public.users',
      };
    }

    const results: SyncUsersToAuthResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      message: '',
    };

    for (const u of appUsers) {
      const email = String(u.email ?? '')
        .trim()
        .toLowerCase();
      if (!email) {
        results.errors.push(`User id=${u.id} has no email, skipped`);
        continue;
      }

      try {
        const one = await this.provisionAuthUser(admin, {
          id: Number(u.id),
          email,
          username: String(u.username ?? ''),
          authId: u.auth_id ? String(u.auth_id) : null,
        });
        if (one.status === 'created') results.created++;
        else if (one.status === 'linked') results.updated++;
        else results.skipped++;
      } catch (err) {
        results.errors.push(
          `${email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    results.message = `Created ${results.created}, linked ${results.updated}, skipped ${results.skipped}. ${results.errors.length} error(s). New accounts require password reset before login.`;
    return results;
  }

  /**
   * Super Admin: provision one public.users row into Supabase Auth (auth.users).
   * Returns a one-time temporary password when a new auth user is created.
   */
  async provisionAuthForAppUser(
    accessToken: string,
    appUserId: number,
    targetUserId: number,
  ): Promise<{
    userId: number;
    email: string;
    authId: string;
    status: 'created' | 'linked' | 'already_linked';
    temporaryPassword: string | null;
  }> {
    if (!isPasswordLoginEnabledInMode()) {
      throw new BadRequestException(
        'Password Auth provisioning disabled (CAPEX_AUTH_MODE=sso). Register the user in public.users; they sign in with Microsoft SSO.',
      );
    }
    await this.adminClient(accessToken, appUserId);
    const tid = Number(targetUserId);
    if (!Number.isFinite(tid) || tid <= 0) {
      throw new BadRequestException('targetUserId is required');
    }

    const serviceKey = getSupabaseServiceKey();
    if (!serviceKey) {
      throw new BadRequestException('SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    const admin = createSupabaseClient(serviceKey);
    const { data: row, error } = await admin
      .from('users')
      .select('id, username, email, auth_id')
      .eq('id', tid)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!row) throw new BadRequestException(`User id=${tid} not found`);

    const email = String(row.email ?? '')
      .trim()
      .toLowerCase();
    if (!email) throw new BadRequestException('User has no email');

    // Normalize stored email so login resolution matches Auth (case-insensitive but keep one form).
    if (String(row.email ?? '').trim() !== email) {
      const { error: normErr } = await admin.from('users').update({ email }).eq('id', tid);
      if (normErr) throw new BadRequestException(normErr.message);
    }

    await this.assertEmailExclusiveToUser(admin, tid, email);

    const existingAuthId = row.auth_id ? String(row.auth_id).trim() : '';
    if (existingAuthId) {
      return {
        userId: tid,
        email,
        authId: existingAuthId,
        status: 'already_linked',
        temporaryPassword: null,
      };
    }

    const one = await this.provisionAuthUser(admin, {
      id: tid,
      email,
      username: String(row.username ?? ''),
      authId: null,
    });

    return {
      userId: tid,
      email,
      authId: one.authId,
      status: one.status === 'created' ? 'created' : 'linked',
      temporaryPassword: one.temporaryPassword,
    };
  }

  private async provisionAuthUser(
    admin: SupabaseClient,
    u: { id: number; email: string; username: string; authId: string | null },
  ): Promise<{
    status: 'created' | 'linked' | 'skipped';
    authId: string;
    temporaryPassword: string | null;
  }> {
    if (u.authId) {
      return { status: 'skipped', authId: u.authId, temporaryPassword: null };
    }

    const temporaryPassword = randomInitialPassword();
    const { data: authUser, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { username: u.username, public_user_id: u.id },
    });

    if (!error && authUser?.user?.id) {
      await admin.from('users').update({ auth_id: authUser.user.id }).eq('id', u.id);
      return {
        status: 'created',
        authId: authUser.user.id,
        temporaryPassword,
      };
    }

    const alreadyExists =
      error?.message?.includes('already') || error?.message?.includes('registered');
    if (!alreadyExists) {
      throw new BadRequestException(error?.message || 'Failed to create auth user');
    }

    const existingAuthId = await this.findAuthUserIdByEmail(admin, u.email);
    if (!existingAuthId) {
      throw new BadRequestException(
        `${u.email}: already in auth but user id not found`,
      );
    }

    // Never attach an Auth identity that already belongs to another public.users row
    // (that would make login resolve the wrong app user / session mismatch).
    const { data: owner, error: ownerErr } = await admin
      .from('users')
      .select('id')
      .eq('auth_id', existingAuthId)
      .maybeSingle();
    if (ownerErr) throw new BadRequestException(ownerErr.message);
    if (owner && Number(owner.id) !== u.id) {
      throw new BadRequestException(
        `${u.email}: Auth sudah terhubung ke user id=${owner.id}, tidak bisa di-link ke id=${u.id}`,
      );
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(existingAuthId, {
      email_confirm: true,
      user_metadata: { username: u.username, public_user_id: u.id },
    });
    if (updateErr) throw new BadRequestException(updateErr.message);

    await admin.from('users').update({ auth_id: existingAuthId }).eq('id', u.id);
    return {
      status: 'linked',
      authId: existingAuthId,
      temporaryPassword: null,
    };
  }

  /** One email → one public.users row (login resolves by auth_id then email). */
  private async assertEmailExclusiveToUser(
    admin: SupabaseClient,
    userId: number,
    email: string,
  ): Promise<void> {
    const { data: rows, error } = await admin
      .from('users')
      .select('id, email')
      .ilike('email', escapeIlikePattern(email));
    if (error) throw new BadRequestException(error.message);
    const clash = (rows ?? []).find(
      (r) =>
        Number(r.id) !== userId &&
        String(r.email ?? '')
          .trim()
          .toLowerCase() === email,
    );
    if (clash) {
      throw new BadRequestException(
        `Email ${email} sudah dipakai user id=${clash.id}. Pakai email lain agar session login tidak bentrok.`,
      );
    }
  }

  private async findAuthUserIdByEmail(
    admin: SupabaseClient,
    email: string,
  ): Promise<string | null> {
    const target = email.trim().toLowerCase();
    let page = 1;
    const perPage = 200;

    while (page <= 50) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        throw new BadRequestException(error.message);
      }
      const users = data?.users ?? [];
      const match = users.find((row) => row.email?.trim().toLowerCase() === target);
      if (match?.id) return match.id;
      if (users.length < perPage) break;
      page += 1;
    }

    return null;
  }
}
