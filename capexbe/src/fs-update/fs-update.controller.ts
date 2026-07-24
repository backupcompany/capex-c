import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { FsUpdateService } from './fs-update.service';
import { runFsPageBundle } from '../fs/fs-page-bundle.util';

@Controller('fs-update')
export class FsUpdateController {
  constructor(private readonly fsUpdateService: FsUpdateService) {}

  @RequirePermission('FS Update', 'view')
  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return runFsPageBundle('fs-update/page-bundle', () =>
      this.fsUpdateService.loadPageBundle(token, body),
    );
  }

  @RequirePermission('FS Update', 'view')
  @Post('meta')
  async meta(@Req() req: Request, @Body() body: unknown) {
    return this.fsUpdateService.loadMeta(requireAccessTokenFromRequest(req), body);
  }

  @RequirePermission('FS Update', 'view')
  @Post('query')
  async query(@Req() req: Request, @Body() body: unknown) {
    return this.fsUpdateService.loadQueryPage(requireAccessTokenFromRequest(req), body);
  }

  @RequirePermission('FS Update', 'view')
  @Post('find-project')
  async findProject(@Req() req: Request, @Body() body: unknown) {
    return this.fsUpdateService.findProject(requireAccessTokenFromRequest(req), body);
  }

  @RequirePermission('FS Update', 'update')
  @Post('save')
  async save(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.fsUpdateService.saveProjects(token, body);
  }
}
