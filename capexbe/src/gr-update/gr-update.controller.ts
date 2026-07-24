import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { GrUpdateService } from './gr-update.service';

@Controller('gr-update')
export class GrUpdateController {
  constructor(private readonly grUpdateService: GrUpdateService) {}

  @RequirePermission('GR Update', 'view')
  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.grUpdateService.loadPageBundle(token, body);
  }

  @RequirePermission('GR Update', 'update')
  @Post('save')
  async save(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.grUpdateService.saveAssets(token, body);
  }
}
