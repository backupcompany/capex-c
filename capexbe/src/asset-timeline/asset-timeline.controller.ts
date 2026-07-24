import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { AssetTimelineService } from './asset-timeline.service';

@Controller()
export class AssetTimelineController {
  constructor(private readonly assetTimelineService: AssetTimelineService) {}

  @RequirePermission('Capex Project List', 'view')
  @Post('asset-timeline')
  async postAssetTimeline(
    @Req() req: Request,
    @Body() body: { assetId: string; workflowSetId: string; projectId?: string },
  ) {
    return this.assetTimelineService.getTimeline(requireAccessTokenFromRequest(req), body);
  }
}
