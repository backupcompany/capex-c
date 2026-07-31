import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { SharedModule } from '../shared/shared.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({
  imports: [AuthCoreModule, SharedModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
