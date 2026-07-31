import { Module } from '@nestjs/common';
import { FsCoreModule } from '../fs/fs-core.module';
import { ExecutiveSummaryController } from './executive-summary.controller';
import { ExecutiveSummaryService } from './executive-summary.service';

@Module({
  imports: [FsCoreModule],
  controllers: [ExecutiveSummaryController],
  providers: [ExecutiveSummaryService],
})
export class ExecutiveSummaryModule {}
