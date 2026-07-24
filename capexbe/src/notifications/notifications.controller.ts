import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @RequirePermission('My Task', 'view')
  @Post('list')
  list(@Req() req: Request, @Body() body: unknown) {
    return this.notificationsService.list(requireAccessTokenFromRequest(req), body);
  }

  @RequirePermission('My Task', 'update')
  @Post('save')
  save(@Req() req: Request, @Body() body: unknown) {
    return this.notificationsService.save(requireAccessTokenFromRequest(req), body);
  }

  @RequirePermission('My Task', 'update')
  @Post('mark-read')
  markRead(@Req() req: Request, @Body() body: unknown) {
    return this.notificationsService.markRead(requireAccessTokenFromRequest(req), body);
  }

  @RequirePermission('My Task', 'update')
  @Post('mark-all-read')
  markAllRead(@Req() req: Request, @Body() body: unknown) {
    return this.notificationsService.markAllRead(requireAccessTokenFromRequest(req), body);
  }
}
