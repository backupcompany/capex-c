import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { fetchAllRecords, toCamelCase } from '../project-list/supabase-helpers';
import { AuthZService } from '../auth/auth-z.service';
import { CacheAsideService } from '../shared/cache-aside.service';
import { FsAuthService } from './fs-auth.service';
import { invalidateFsScreenCaches } from './fs-cache-invalidation.util';
import { FS_STUDY_COLUMNS_FULL, FS_REALIZATION_COLUMNS } from './fs-db.constants';
import type { FsCreatePayload, FsRealizationPayload, FsStudyPermissionContext, FsUpdatePayload } from './fs.dto';

const FS_STUDY_COLUMNS = FS_STUDY_COLUMNS_FULL;

@Injectable()
export class FsService {
  constructor(
    private readonly fsAuth: FsAuthService,
    private readonly authZ: AuthZService,
    private readonly cacheAside: CacheAsideService,
  ) {}

  private async invalidateFsPageCaches(userId: number): Promise<void> {
    await invalidateFsScreenCaches(this.cacheAside, userId);
  }

  async listFeasibilityStudies(accessToken: string, userId: number) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const rows = await fetchAllRecords(client, 'feasibility_studies', FS_STUDY_COLUMNS);
    return { studies: rows ? rows.map(toCamelCase) : [] };
  }

  async getFeasibilityStudyById(accessToken: string, userId: number, id: string) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const { data, error } = await client
      .from('feasibility_studies')
      .select(FS_STUDY_COLUMNS)
      .eq('id', id.trim())
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException(`Feasibility study not found: ${id}`);
    return toCamelCase(data);
  }

  async createFeasibilityStudy(accessToken: string, userId: number, payload: FsCreatePayload) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'create');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const id = payload.id || `FS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const row = {
      id,
      project_id: payload.projectId,
      fs_type: payload.fsType,
      amount: payload.amount,
      irr: payload.irr,
      payback_period: payload.paybackPeriod,
      npv: payload.npv,
      roi: payload.roi,
      planned_revenue_start_date: payload.plannedRevenueStartDate,
      actual_revenue_start_date: payload.actualRevenueStartDate ?? null,
      monthly_revenue_plan: payload.monthlyRevenuePlan,
      throughput: payload.throughput ?? 0,
      conclusion: payload.conclusion ?? 'Pending',
      follow_up_action: payload.followUpAction ?? null,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await client.from('feasibility_studies').insert(row).select(FS_STUDY_COLUMNS).single();
    if (error) throw new BadRequestException(error.message);
    await this.invalidateFsPageCaches(userId);
    return toCamelCase(data);
  }

  private resolveFsStudyUpdateHierarchies(
    updates: FsUpdatePayload,
    permissionContext?: FsStudyPermissionContext,
  ): string[] {
    if (permissionContext === 'FS Approval') return ['FS Approval', 'FS Update'];
    if (permissionContext === 'FS Realization') return ['FS Realization', 'FS Update'];
    if (permissionContext === 'FS Update') return ['FS Update'];

    const keys = Object.keys(updates);
    const approvalFields = new Set(['conclusion', 'followUpAction']);
    const realizationFields = new Set(['actualRevenueStartDate']);
    const approvalOnly = keys.length > 0 && keys.every((k) => approvalFields.has(k));
    const realizationOnly = keys.length > 0 && keys.every((k) => realizationFields.has(k));
    if (approvalOnly) return ['FS Approval', 'FS Update'];
    if (realizationOnly) return ['FS Realization', 'FS Update'];
    return ['FS Update'];
  }

  async updateFeasibilityStudy(
    accessToken: string,
    userId: number,
    id: string,
    updates: FsUpdatePayload,
    permissionContext?: FsStudyPermissionContext,
  ) {
    if (!id?.trim()) throw new BadRequestException('id is required');
    const hierarchies = this.resolveFsStudyUpdateHierarchies(updates, permissionContext);
    await this.authZ.assertAnyHierarchyPermission(accessToken, userId, hierarchies, 'update');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.fsType !== undefined) row.fs_type = updates.fsType;
    if (updates.amount !== undefined) row.amount = updates.amount;
    if (updates.irr !== undefined) row.irr = updates.irr;
    if (updates.paybackPeriod !== undefined) row.payback_period = updates.paybackPeriod;
    if (updates.npv !== undefined) row.npv = updates.npv;
    if (updates.roi !== undefined) row.roi = updates.roi;
    if (updates.plannedRevenueStartDate !== undefined) row.planned_revenue_start_date = updates.plannedRevenueStartDate;
    if (updates.actualRevenueStartDate !== undefined) row.actual_revenue_start_date = updates.actualRevenueStartDate;
    if (updates.monthlyRevenuePlan !== undefined) row.monthly_revenue_plan = updates.monthlyRevenuePlan;
    if (updates.throughput !== undefined) row.throughput = updates.throughput;
    if (updates.conclusion !== undefined) row.conclusion = updates.conclusion;
    if (updates.followUpAction !== undefined) row.follow_up_action = updates.followUpAction;

    const { data, error } = await client
      .from('feasibility_studies')
      .update(row)
      .eq('id', id.trim())
      .select(FS_STUDY_COLUMNS)
      .single();
    if (error) throw new BadRequestException(error.message);
    await this.invalidateFsPageCaches(userId);
    return toCamelCase(data);
  }

  async listRealizations(accessToken: string, userId: number, fsId: string) {
    if (!fsId?.trim()) throw new BadRequestException('fsId is required');
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Realization', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const { data, error } = await client
      .from('fs_realizations')
      .select(FS_REALIZATION_COLUMNS)
      .eq('fs_id', fsId.trim())
      .order('month', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return { realizations: data ? data.map(toCamelCase) : [] };
  }

  async saveRealization(accessToken: string, userId: number, payload: FsRealizationPayload) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Realization', 'update');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const id = payload.id || `FSR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const row = {
      id,
      fs_id: payload.fsId,
      month: payload.month,
      actual_revenue: payload.actualRevenue,
      actual_throughput: payload.actualThroughput ?? 0,
      notes: payload.notes ?? null,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await client
      .from('fs_realizations')
      .upsert(row, { onConflict: 'id' })
      .select(FS_REALIZATION_COLUMNS)
      .single();
    if (error) throw new BadRequestException(error.message);
    await this.invalidateFsPageCaches(userId);
    return toCamelCase(data);
  }
}
