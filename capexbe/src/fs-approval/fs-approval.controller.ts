import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { FsApprovalService } from './fs-approval.service';
import { runFsPageBundle } from '../fs/fs-page-bundle.util';

@RequirePermission('FS Approval', 'view')
@Controller('fs-approval')
export class FsApprovalController {
  constructor(private readonly fsApprovalService: FsApprovalService) {}

  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return runFsPageBundle('fs-approval/page-bundle', () =>
      this.fsApprovalService.loadPageBundle(token, body),
    );
  }

  @Post('query')
  async query(@Req() req: Request, @Body() body: unknown) {
    return this.fsApprovalService.loadQueryPage(requireAccessTokenFromRequest(req), body);
  }
}
