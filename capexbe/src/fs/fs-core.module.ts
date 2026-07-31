import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { FsService } from './fs.service';
import { FsAuthService } from './fs-auth.service';

/** Shared FS providers — no HTTP routes (used by executive-summary leaf + FS leaf). */
@Module({
  imports: [AuthCoreModule],
  providers: [FsService, FsAuthService],
  exports: [FsService, FsAuthService],
})
export class FsCoreModule {}
