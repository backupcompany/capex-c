import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireAnyPermission } from '../auth/decorators/any-permission.decorator';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { MomDailySummaryService } from './mom-daily-summary.service';

const MOM_READ = RequireAnyPermission(
  { hierarchy: 'Daily MOM Summary', level: 'view' },
  { hierarchy: 'Project', level: 'view' },
);

@MOM_READ
@Controller('mom-daily-summary')
export class MomDailySummaryController {
  constructor(private readonly momDailySummaryService: MomDailySummaryService) {}

  @Post('rows')
  async rows(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.momDailySummaryService.loadSummary(token, body);
  }
}
