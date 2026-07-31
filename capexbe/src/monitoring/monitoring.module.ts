import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
})
export class MonitoringModule {}
