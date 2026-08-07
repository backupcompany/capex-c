import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  getCallerUserId,
  requireAccessTokenFromRequest,
} from '../auth/request-access-token.util';
import { BootstrapService } from './bootstrap.service';

@Controller('bootstrap')
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @Post()
  async bootstrap(@Req() req: Request) {
    const token = requireAccessTokenFromRequest(req);
    const userId = getCallerUserId(req);
    return this.bootstrapService.loadAppInitPack(token, userId);
  }

  @Post('users-directory')
  async usersDirectory(@Req() req: Request) {
    const token = requireAccessTokenFromRequest(req);
    const userId = getCallerUserId(req);
    return this.bootstrapService.loadUsersDirectory(token, userId);
  }
}
