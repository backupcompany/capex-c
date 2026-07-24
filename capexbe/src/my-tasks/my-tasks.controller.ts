import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { MyTasksService } from './my-tasks.service';
import type { MyTasksListQuery, MyTasksSortOption, MyTasksTaskViewMode } from './my-tasks-query';

class MyTasksBodyDto implements MyTasksListQuery {
  userId!: number;
  periodName?: string;
  skipCache?: boolean;
  page?: number;
  pageSize?: number;
  taskViewMode?: MyTasksTaskViewMode;
  showCompleted?: boolean;
  search?: string;
  selectedArchetypes?: string[];
  selectedHUs?: string[];
  selectedAssignedRoles?: string[];
  sortBy?: MyTasksSortOption;
}

@RequirePermission('My Task', 'view')
@Controller()
export class MyTasksController {
  constructor(private readonly myTasksService: MyTasksService) {}

  @Post('my-tasks')
  async myTasks(@Req() req: Request, @Body() body: MyTasksBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid userId');
    }
    const { userId: _uid, periodName, skipCache, ...query } = body;
    return this.myTasksService.loadMyTasksPage(
      token,
      userId,
      periodName,
      !!skipCache,
      query,
    );
  }

  @SkipThrottle()
  @Post('my-tasks/open-count')
  async openCount(@Req() req: Request, @Body() body: MyTasksBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid userId');
    }
    return this.myTasksService.loadOpenTaskCount(token, userId, body.periodName);
  }

  @SkipThrottle()
  @Post('my-tasks/open-for-notifications')
  async openForNotifications(@Req() req: Request, @Body() body: MyTasksBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid userId');
    }
    return this.myTasksService.loadOpenTasksForNotifications(token, userId, body.periodName);
  }
}
