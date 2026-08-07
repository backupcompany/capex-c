import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthZService } from '../auth/auth-z.service';
import { maskEmail } from '../shared/pii-hash.util';
import { viewerCanSeeUserPii } from '../shared/pii-access.util';
import {
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';
import { parseMonitoringUsersQuery } from './monitoring.dto';
import type { MonitoringUserRowDto } from './monitoring.dto';
import { resolveBodyActorUserId } from '../shared/public-id.util';
import {
  buildPageBundleFromContext,
  loadMonitoringContext,
  loadMonitoringScreen,
  loadMonitoringUsersPage,
} from './monitoring-user.loader';

type MonitoringDataCache = {
  expiresAt: number;
  admin: SupabaseClient;
  contextPromise: ReturnType<typeof loadMonitoringContext>;
};

@Injectable()
export class MonitoringService {
  private cache: MonitoringDataCache | null = null;
  private readonly cacheTtlMs = 60_000;

  constructor(private readonly authZ: AuthZService) {}

  private adminClient(): SupabaseClient {
    const key = getSupabaseServiceKey();
    if (!key) {
      throw new BadRequestException('Database service key not configured');
    }
    return createSupabaseClient(key);
  }

  private getCachedContext() {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache;
    }
    const admin = this.adminClient();
    const contextPromise = loadMonitoringContext(admin);
    this.cache = { admin, expiresAt: now + this.cacheTtlMs, contextPromise };
    return this.cache;
  }

  private async assertView(accessToken: string, userId: number): Promise<void> {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'User Monitoring', 'view');
  }

  private maskRowsIfNeeded(rows: MonitoringUserRowDto[], includePii: boolean) {
    if (includePii) return rows;
    return rows.map((row) => ({
      ...row,
      email: row.email ? maskEmail(row.email) : '',
    }));
  }

  async loadPageBundle(accessToken: string, body: unknown) {
    const userId = resolveBodyActorUserId(body);
    await this.assertView(accessToken, userId);
    const cached = this.getCachedContext();
    const ctx = await cached.contextPromise;
    return buildPageBundleFromContext(ctx);
  }

  async loadUsersPage(accessToken: string, body: unknown) {
    const query = parseMonitoringUsersQuery(body);
    await this.assertView(accessToken, query.userId);
    const includePii = await viewerCanSeeUserPii(this.authZ, accessToken, query.userId);
    const cached = this.getCachedContext();
    const ctx = await cached.contextPromise;
    const page = await loadMonitoringUsersPage(cached.admin, query, ctx.allRows);
    return {
      ...page,
      rows: this.maskRowsIfNeeded(page.rows, includePii),
    };
  }

  async loadScreen(accessToken: string, body: unknown) {
    const query = parseMonitoringUsersQuery(body);
    await this.assertView(accessToken, query.userId);
    const includePii = await viewerCanSeeUserPii(this.authZ, accessToken, query.userId);
    const cached = this.getCachedContext();
    const ctx = await cached.contextPromise;
    const screen = await loadMonitoringScreen(cached.admin, query, ctx);
    return {
      ...screen,
      usersPage: {
        ...screen.usersPage,
        rows: this.maskRowsIfNeeded(screen.usersPage.rows, includePii),
      },
    };
  }
}
