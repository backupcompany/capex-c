import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { MomDailySummaryService } from './mom-daily-summary.service';

@RequirePermission('Daily MOM Summary', 'view')
@Controller('mom-daily-summary')
export class MomDailySummaryController {
  constructor(private readonly momDailySummaryService: MomDailySummaryService) {}

  @Post('rows')
  async rows(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.momDailySummaryService.loadSummary(token, body);
  }
}
