import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/decorators/roles.decorator';
import { requireAccessTokenFromRequest, getCallerUserId } from '../auth/request-access-token.util';
import { UserAdminService } from './user-admin.service';

/** Multer in-memory upload (no @types/multer required). */
type UploadedMemoryFile = { buffer: Buffer; originalname: string };

class BulkDeleteBodyDto {
  userId!: number;
  ids!: number[];
}

@Roles('super_admin', 'pmo')
@Controller('user-admin')
export class UserAdminController {
  constructor(private readonly userAdminService: UserAdminService) {}

  @Post('office-list-diff')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async officeListDiff(
    @Req() req: Request,
    @UploadedFile() file: UploadedMemoryFile | undefined,
  ) {
    const token = requireAccessTokenFromRequest(req);
    const appUserId = getCallerUserId(req);
    if (!file?.buffer) {
      throw new BadRequestException('Missing file (form field "file")');
    }
    return this.userAdminService.compareOfficeList(token, appUserId, {
      buffer: file.buffer,
      originalname: file.originalname || 'upload',
    });
  }

  @Post('bulk-delete')
  async bulkDelete(@Req() req: Request, @Body() body: BulkDeleteBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const appUserId = getCallerUserId(req);
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    return this.userAdminService.bulkDeleteUsers(token, appUserId, ids);
  }

  @Post('sync-to-auth')
  async syncToAuth(@Req() req: Request, @Body() body: BulkDeleteBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const appUserId = getCallerUserId(req);
    return this.userAdminService.syncUsersToAuth(token, appUserId);
  }
}
