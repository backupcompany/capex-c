import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { fetchAllRecords } from '../project-list/supabase-helpers';
import { CacheAsideService } from '../shared/cache-aside.service';
import {
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';
import {
  ALL_BACKUP_TABLES,
  BACKUP_VERSION,
  isBackupPayload,
  MASTER_BACKUP_TABLES,
  OPERATIONAL_BACKUP_TABLES,
  type BackupPayload,
  type BackupTableDef,
} from './backup-tables.util';

const UPSERT_BATCH = 200;

@Injectable()
export class BackupService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
    private readonly cacheAside: CacheAsideService,
  ) {}

  private adminClient(): SupabaseClient {
    const key = getSupabaseServiceKey();
    if (!key) {
      throw new BadRequestException('Database service key not configured');
    }
    return createSupabaseClient(key);
  }

  private async assertMigrationUpdate(accessToken: string) {
    const ctx = await this.authContext.resolve(accessToken);
    await this.authZ.assertHierarchyPermission(
      accessToken,
      ctx.userId,
      'Data Migration',
      'update',
    );
    return ctx;
  }

  async exportFull(accessToken: string): Promise<BackupPayload> {
    await this.assertMigrationUpdate(accessToken);
    const client = this.adminClient();
    const tables: Record<string, unknown[]> = {};

    await Promise.all(
      ALL_BACKUP_TABLES.map(async (def) => {
        tables[def.name] = await fetchAllRecords(client, def.name, '*');
      }),
    );

    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      tables,
    };
  }

  async importFull(
    accessToken: string,
    body: unknown,
  ): Promise<{ ok: true; restored: { operational: number; master: number } }> {
    await this.assertMigrationUpdate(accessToken);
    const parsed = this.parseImportBody(body);
    const client = this.adminClient();

    let operationalRows = 0;
    for (const def of OPERATIONAL_BACKUP_TABLES) {
      operationalRows += await this.restoreTable(client, def, parsed.tables);
    }

    let masterRows = 0;
    if (parsed.restoreMasterConfig) {
      for (const def of MASTER_BACKUP_TABLES) {
        masterRows += await this.restoreTable(client, def, parsed.tables);
      }
    }

    await this.cacheAside.invalidateByPrefix('app:');

    return {
      ok: true,
      restored: { operational: operationalRows, master: masterRows },
    };
  }

  private parseImportBody(body: unknown): { tables: Record<string, unknown[]>; restoreMasterConfig: boolean } {
    const root = (body ?? {}) as Record<string, unknown>;
    const restoreMasterConfig = root.restoreMasterConfig === true;
    const backupRaw = root.backup ?? root;

    if (!isBackupPayload(backupRaw)) {
      throw new BadRequestException('Invalid backup payload — expected { tables: { ... } }');
    }

    const tables: Record<string, unknown[]> = {};
    for (const [name, rows] of Object.entries(backupRaw.tables)) {
      if (!Array.isArray(rows)) {
        throw new BadRequestException(`Backup table "${name}" must be an array`);
      }
      tables[name] = rows;
    }

    return { tables, restoreMasterConfig };
  }

  private async restoreTable(
    client: SupabaseClient,
    def: BackupTableDef,
    tables: Record<string, unknown[]>,
  ): Promise<number> {
    const rows = tables[def.name];
    if (!rows?.length) return 0;

    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const chunk = rows.slice(i, i + UPSERT_BATCH);
      const options = def.onConflict ? { onConflict: def.onConflict } : { onConflict: 'id' };
      const { error } = await client.from(def.name).upsert(chunk as never[], options);
      if (error) {
        throw new BadRequestException(`Backup import ${def.name}: ${error.message}`);
      }
    }

    return rows.length;
  }
}
