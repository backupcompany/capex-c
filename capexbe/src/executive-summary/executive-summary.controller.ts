import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import {
  bodyWithCallerUserId,
  requireAccessTokenFromRequest,
} from '../auth/request-access-token.util';
import { ExecutiveSummaryService } from './executive-summary.service';

@RequirePermission('Executive Summary', 'view')
@Controller('executive-summary')
export class ExecutiveSummaryController {
  constructor(private readonly executiveSummaryService: ExecutiveSummaryService) {}

  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: unknown) {
    return this.executiveSummaryService.loadPageBundle(
      requireAccessTokenFromRequest(req),
      bodyWithCallerUserId(req, body),
    );
  }

  @Post('summary-stats')
  async summaryStats(@Req() req: Request, @Body() body: unknown) {
    return this.executiveSummaryService.loadStats(
      requireAccessTokenFromRequest(req),
      bodyWithCallerUserId(req, body),
    );
  }

  @Post('projects-page')
  async projectsPage(@Req() req: Request, @Body() body: unknown) {
    return this.executiveSummaryService.loadProjectsPage(
      requireAccessTokenFromRequest(req),
      bodyWithCallerUserId(req, body),
    );
  }

  @Post('dashboard-kpi')
  async dashboardKpi(@Req() req: Request, @Body() body: unknown) {
    return this.executiveSummaryService.loadDashboardKpi(
      requireAccessTokenFromRequest(req),
      bodyWithCallerUserId(req, body),
    );
  }

  @Post('dashboard-charts')
  async dashboardCharts(@Req() req: Request, @Body() body: unknown) {
    return this.executiveSummaryService.loadDashboardCharts(
      requireAccessTokenFromRequest(req),
      bodyWithCallerUserId(req, body),
    );
  }

  @Post('dashboard-metrics')
  async dashboardMetrics(@Req() req: Request, @Body() body: unknown) {
    return this.executiveSummaryService.loadDashboardMetrics(
      requireAccessTokenFromRequest(req),
      bodyWithCallerUserId(req, body),
    );
  }
}
