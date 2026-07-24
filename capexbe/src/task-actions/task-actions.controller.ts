import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireAnyPermission } from '../auth/decorators/any-permission.decorator';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { TaskActionsService } from './task-actions.service';

const TASK_READ = RequireAnyPermission(
  { hierarchy: 'My Task', level: 'view' },
  { hierarchy: 'Capex Project List', level: 'view' },
);

const TASK_WRITE = RequireAnyPermission(
  { hierarchy: 'My Task', level: 'update' },
  { hierarchy: 'Capex Project List', level: 'update' },
);

class CompleteWorkflowDto {
  userId!: number;
  assetId!: string;
  taskId!: string;
  remark!: string;
  roleId!: number;
}

class CompleteAdhocDto {
  userId!: number;
  adhocTaskId!: string;
  remark!: string;
}

class AssetTaskDto {
  userId!: number;
  assetId!: string;
  taskId!: string;
}

class UpdateRemarkDto {
  userId!: number;
  assetId!: string;
  taskId!: string;
  remark!: string;
}

class UpsertFsApprovalDto {
  userId!: number;
  projectId!: string;
  conclusion!: string;
  amount?: number;
  followUpAction?: string | null;
  fsType?: string;
}

@Controller('task-actions')
export class TaskActionsController {
  constructor(private readonly taskActionsService: TaskActionsService) {}

  @TASK_WRITE
  @Post('complete-workflow')
  async completeWorkflow(@Req() req: Request, @Body() body: CompleteWorkflowDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.completeWorkflow(token, body);
  }

  @TASK_WRITE
  @Post('complete-adhoc')
  async completeAdhoc(@Req() req: Request, @Body() body: CompleteAdhocDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.completeAdhoc(token, body);
  }

  @TASK_WRITE
  @Post('revert-to-open')
  async revertToOpen(@Req() req: Request, @Body() body: AssetTaskDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.revertToOpen(token, body);
  }

  @TASK_WRITE
  @Post('report-not-yet-done')
  async reportNotYetDone(@Req() req: Request, @Body() body: AssetTaskDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.reportNotYetDone(token, body);
  }

  @TASK_WRITE
  @Post('withdraw-report')
  async withdrawReport(@Req() req: Request, @Body() body: AssetTaskDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.withdrawReport(token, body);
  }

  @TASK_WRITE
  @Post('update-remark')
  async updateRemark(@Req() req: Request, @Body() body: UpdateRemarkDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.updateRemark(token, body);
  }

  @RequirePermission('FS Approval', 'update')
  @Post('upsert-fs-approval')
  async upsertFsApproval(@Req() req: Request, @Body() body: UpsertFsApprovalDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.upsertFsApproval(token, body);
  }

  @TASK_WRITE
  @Post('recalculate-asset')
  async recalculateAsset(@Req() req: Request, @Body() body: AssetTaskDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.recalculateAsset(token, body);
  }

  @TASK_WRITE
  @Post('save-mom')
  async saveMom(@Req() req: Request, @Body() body: { userId: number; mom: Record<string, unknown> }) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.saveMom(token, body);
  }

  @TASK_WRITE
  @Post('save-adhoc')
  async saveAdhoc(@Req() req: Request, @Body() body: { userId: number; task: Record<string, unknown> }) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.saveAdhocTask(token, body);
  }

  @TASK_WRITE
  @Post('reschedule')
  async reschedule(@Req() req: Request, @Body() body: AssetTaskDto & { days: number; reason: string }) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.rescheduleTask(token, body);
  }

  @TASK_WRITE
  @Post('update-sla-override')
  async updateSlaOverride(
    @Req() req: Request,
    @Body() body: AssetTaskDto & { slaDays: number | null },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.updateSlaOverride(token, body);
  }

  @TASK_WRITE
  @Post('trigger-system')
  async triggerSystem(
    @Req() req: Request,
    @Body() body: { userId: number; assetId: string; triggerEvent: string; completedAt?: string },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.triggerSystemTask(token, body);
  }

  @TASK_WRITE
  @Post('trigger-system-batch')
  async triggerSystemBatch(
    @Req() req: Request,
    @Body() body: { userId: number; assetIds: string[]; triggerEvent: string },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.triggerSystemTaskBatch(token, body);
  }

  @TASK_READ
  @Post('asset-task-statuses-for-asset')
  async assetTaskStatusesForAsset(
    @Req() req: Request,
    @Body() body: { userId: number; assetId: string },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.getAssetTaskStatusesForAsset(token, body);
  }

  @TASK_READ
  @Post('task-logs-for-asset')
  async taskLogsForAsset(
    @Req() req: Request,
    @Body() body: { userId: number; assetId: string },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.getTaskLogsForAsset(token, body);
  }

  @TASK_READ
  @Post('moms-for-asset')
  async momsForAsset(
    @Req() req: Request,
    @Body() body: { userId: number; assetId: string },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.getMomsForAsset(token, body);
  }

  @TASK_READ
  @Post('task-logs-for-asset-ids')
  async taskLogsForAssetIds(
    @Req() req: Request,
    @Body() body: { userId: number; assetIds: string[] },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.getTaskLogsForAssetIds(token, body);
  }

  @TASK_READ
  @Post('asset-task-statuses-for-asset-ids')
  async assetTaskStatusesForAssetIds(
    @Req() req: Request,
    @Body() body: { userId: number; assetIds: string[] },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.getAssetTaskStatusesForAssetIds(token, body);
  }
}
