import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { PoUpdateService } from './po-update.service';

@Controller('po-update')
export class PoUpdateController {
  constructor(private readonly poUpdateService: PoUpdateService) {}

  @RequirePermission('PO Update', 'view')
  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.poUpdateService.loadPageBundle(token, body);
  }

  @RequirePermission('PO Update', 'update')
  @Post('save')
  async save(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.poUpdateService.saveAssets(token, body);
  }
}
