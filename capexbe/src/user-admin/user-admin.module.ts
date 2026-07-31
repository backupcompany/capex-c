import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { UserAdminController } from './user-admin.controller';
import { UserAdminService } from './user-admin.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [UserAdminController],
  providers: [UserAdminService],
})
export class UserAdminModule {}
