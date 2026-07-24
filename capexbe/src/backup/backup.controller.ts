import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { BackupService } from './backup.service';

@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @RequirePermission('Data Migration', 'update')
  @Post('export-full')
  async exportFull(@Req() req: Request) {
    return this.backupService.exportFull(requireAccessTokenFromRequest(req));
  }

  @RequirePermission('Data Migration', 'update')
  @Post('import-full')
  async importFull(@Req() req: Request, @Body() body: unknown) {
    return this.backupService.importFull(requireAccessTokenFromRequest(req), body);
  }
}
