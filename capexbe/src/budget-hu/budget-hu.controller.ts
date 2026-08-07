import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  BUDGET_STACK_CREATE,
  BUDGET_STACK_UPDATE,
  BUDGET_STACK_VIEW,
} from '../auth/budget-permission.constants';
import {
  getCallerUserId,
  requireAccessTokenFromRequest,
} from '../auth/request-access-token.util';
import { BudgetHuService } from './budget-hu.service';

class BudgetHuBundleBodyDto {
  periodName!: string;
  userId!: number;
  skipCache?: boolean;
  /** Scope project/asset hydration to one HU (fast Budget HU page). */
  hospitalUnitId?: string;
  /** Skip master config in payload when FE already has config query. */
  omitConfig?: boolean;
  /** List view — skip nested assets; load via project-assets on modal open. */
  omitAssets?: boolean;
  /** HU shell only — strategic projects via hu-projects-page. */
  shellOnly?: boolean;
  /** Budget Network / Siloam: slim projects, skip asset hydration. */
  networkView?: boolean;
  /** Budget Network shell — no projects (load category on click). */
  networkShell?: boolean;
  /** Budget Network — scope projects to one budget category. */
  categoryId?: string;
}

class BudgetHuInvalidateBodyDto {
  periodName!: string;
  userId!: number;
}

class BudgetHuSaveBodyDto {
  periodName!: string;
  userId!: number;
  budgetPeriod!: Record<string, unknown>;
  partial?: boolean;
  huId?: string;
  changedProjectIds?: string[];
  deletedProjectIds?: string[];
  touchedAssetIds?: string[];
  projectsOnly?: boolean;
}

class BudgetHuAllocateProjectCodeDto {
  userId!: number;
  periodName!: string;
  huCode!: string;
  preferredCode?: string;
  excludeProjectId?: string;
}

class BudgetHuAllocateAssetCodeDto {
  userId!: number;
  projectCode!: string;
  preferredCode?: string;
  excludeAssetId?: string;
}

class BudgetHuSyncStampDto {
  userId!: number;
  periodName!: string;
  hospitalUnitId!: string;
}

class BudgetHuSaveProjectDto {
  userId!: number;
  periodName!: string;
  project!: Record<string, unknown>;
}

class BudgetHuSaveAssetDto {
  userId!: number;
  periodName!: string;
  asset!: Record<string, unknown>;
}

class BudgetHuSavePurchaseOrderDto {
  userId!: number;
  periodName!: string;
  purchaseOrder!: Record<string, unknown>;
  action?: 'create' | 'update';
}

class BudgetHuPurchaseOrderGetDto {
  userId!: number;
  poId!: string;
}

class BudgetHuPurchaseOrdersForProjectDto {
  userId!: number;
  projectId!: string;
}

class BudgetHuProjectsForPeriodDto {
  userId!: number;
  periodName!: string;
}

class BudgetHuProjectsPageDto {
  periodName!: string;
  userId!: number;
  hospitalUnitId!: string;
  page?: number;
  pageSize?: number;
  search?: string;
  skipCache?: boolean;
}

class BudgetHuProjectAssetsDto {
  userId!: number;
  periodName!: string;
  projectId!: string;
  skipCache?: boolean;
}

@Controller('budget-hu')
export class BudgetHuController {
  constructor(private readonly budgetHuService: BudgetHuService) {}

  @BUDGET_STACK_VIEW
  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: BudgetHuBundleBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.loadPageBundle(
      token,
      getCallerUserId(req),
      body.periodName,
      !!body.skipCache,
      {
        hospitalUnitId: body.hospitalUnitId,
        omitConfig: !!body.omitConfig,
        omitAssets: !!body.omitAssets,
        shellOnly: !!body.shellOnly,
      },
    );
  }

  @BUDGET_STACK_VIEW
  @Post('period')
  async periodOnly(@Req() req: Request, @Body() body: BudgetHuBundleBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.loadBudgetPeriodOnly(
      token,
      getCallerUserId(req),
      body.periodName,
      !!body.skipCache,
      { networkView: !!body.networkView, networkShell: !!body.networkShell, categoryId: body.categoryId },
    );
  }

  @BUDGET_STACK_VIEW
  @Post('period-structure')
  async periodStructure(@Req() req: Request, @Body() body: BudgetHuBundleBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.loadBudgetPeriodStructure(
      token,
      getCallerUserId(req),
      body.periodName,
      !!body.skipCache,
    );
  }

  @BUDGET_STACK_VIEW
  @Post('config-bundle')
  async configBundle(@Req() req: Request, @Body() body: BudgetHuBundleBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.loadConfigBundle(token, getCallerUserId(req), !!body.skipCache);
  }

  @BUDGET_STACK_VIEW
  @Post('project-asset-counts')
  async projectAssetCounts(@Req() req: Request, @Body() body: BudgetHuBundleBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.loadProjectAssetCounts(
      token,
      getCallerUserId(req),
      body.periodName,
      !!body.skipCache,
      { hospitalUnitId: body.hospitalUnitId },
    );
  }

  @BUDGET_STACK_VIEW
  @Post('hu-projects-page')
  async huProjectsPage(@Req() req: Request, @Body() body: BudgetHuProjectsPageDto) {
    const token = requireAccessTokenFromRequest(req);
    const huId = String(body.hospitalUnitId ?? '').trim();
    if (!huId) throw new BadRequestException('hospitalUnitId is required');
    return this.budgetHuService.loadHuProjectsPage(
      token,
      getCallerUserId(req),
      body.periodName,
      huId,
      Number(body.page ?? 1),
      Number(body.pageSize ?? 20),
      String(body.search ?? ''),
      !!body.skipCache,
    );
  }

  @BUDGET_STACK_VIEW
  @Post('project-assets')
  async projectAssets(@Req() req: Request, @Body() body: BudgetHuProjectAssetsDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.loadProjectAssets(
      token,
      getCallerUserId(req),
      body.periodName,
      body.projectId,
      !!body.skipCache,
    );
  }

  @BUDGET_STACK_UPDATE
  @Post('invalidate-cache')
  async invalidateCache(@Req() req: Request, @Body() body: BudgetHuInvalidateBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    await this.budgetHuService.invalidateForPeriod(
      token,
      getCallerUserId(req),
      body.periodName,
    );
    return { ok: true };
  }

  @BUDGET_STACK_UPDATE
  @Post('allocate-project-code')
  async allocateProjectCode(@Req() req: Request, @Body() body: BudgetHuAllocateProjectCodeDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.allocateProjectCode(token, getCallerUserId(req), body);
  }

  @BUDGET_STACK_UPDATE
  @Post('allocate-asset-code')
  async allocateAssetCode(@Req() req: Request, @Body() body: BudgetHuAllocateAssetCodeDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.allocateAssetCode(token, getCallerUserId(req), body);
  }

  /** Lightweight peer-change detector — uncached; polled while Budget HU is open. */
  @BUDGET_STACK_UPDATE
  @Post('hu-sync-stamp')
  async huSyncStamp(@Req() req: Request, @Body() body: BudgetHuSyncStampDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.getHuSyncStamp(
      token,
      getCallerUserId(req),
      body.periodName,
      body.hospitalUnitId,
    );
  }

  @BUDGET_STACK_UPDATE
  @Post('save')
  async save(@Req() req: Request, @Body() body: BudgetHuSaveBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.savePeriod(token, getCallerUserId(req), body);
  }

  @BUDGET_STACK_UPDATE
  @Post('save-period')
  async savePeriod(@Req() req: Request, @Body() body: BudgetHuSaveBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.savePeriod(token, getCallerUserId(req), body);
  }

  @BUDGET_STACK_UPDATE
  @Post('save-project')
  async saveProject(@Req() req: Request, @Body() body: BudgetHuSaveProjectDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.saveSingleProject(
      token,
      getCallerUserId(req),
      body.periodName,
      body.project ?? {},
    );
  }

  @BUDGET_STACK_UPDATE
  @Post('save-asset')
  async saveAsset(@Req() req: Request, @Body() body: BudgetHuSaveAssetDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.saveSingleAsset(
      token,
      getCallerUserId(req),
      body.periodName,
      body.asset ?? {},
    );
  }

  @BUDGET_STACK_UPDATE
  @Post('save-purchase-order')
  async savePurchaseOrder(@Req() req: Request, @Body() body: BudgetHuSavePurchaseOrderDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.savePurchaseOrder(
      token,
      getCallerUserId(req),
      body.periodName,
      body.purchaseOrder ?? {},
      body.action === 'update' ? 'update' : 'create',
    );
  }

  @BUDGET_STACK_VIEW
  @Post('purchase-order/get')
  async getPurchaseOrder(@Req() req: Request, @Body() body: BudgetHuPurchaseOrderGetDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.getPurchaseOrder(token, getCallerUserId(req), body.poId);
  }

  @BUDGET_STACK_VIEW
  @Post('purchase-orders/for-project')
  async getPurchaseOrdersForProject(
    @Req() req: Request,
    @Body() body: BudgetHuPurchaseOrdersForProjectDto,
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.getPurchaseOrdersForProject(
      token,
      getCallerUserId(req),
      body.projectId,
    );
  }

  @BUDGET_STACK_VIEW
  @Post('projects-for-period')
  async projectsForPeriod(@Req() req: Request, @Body() body: BudgetHuProjectsForPeriodDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.loadProjectsForPeriod(
      token,
      getCallerUserId(req),
      body.periodName,
    );
  }
}
