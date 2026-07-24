import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireAnyPermission } from '../auth/decorators/any-permission.decorator';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequireAnyPermission(
    { hierarchy: 'Budget HU', level: 'view' },
    { hierarchy: 'Capex Project List', level: 'view' },
  )
  @Post('list-for-entity')
  listForEntity(@Req() req: Request, @Body() body: unknown) {
    return this.auditService.listForEntity(requireAccessTokenFromRequest(req), body);
  }

  @RequireAnyPermission(
    { hierarchy: 'Budget HU', level: 'update' },
    { hierarchy: 'Capex Project List', level: 'update' },
  )
  @Post('save-batch')
  saveBatch(@Req() req: Request, @Body() body: unknown) {
    return this.auditService.saveBatch(requireAccessTokenFromRequest(req), body);
  }
}
