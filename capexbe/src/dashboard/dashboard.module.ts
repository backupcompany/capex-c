import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
