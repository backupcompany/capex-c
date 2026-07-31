import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../../capexbe/src/auth/auth-core.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
