import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { MomDailySummaryController } from './mom-daily-summary.controller';
import { MomDailySummaryService } from './mom-daily-summary.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [MomDailySummaryController],
  providers: [MomDailySummaryService],
})
export class MomDailySummaryModule {}
