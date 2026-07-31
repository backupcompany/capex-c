import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { AssetTimelineController } from './asset-timeline.controller';
import { AssetTimelineService } from './asset-timeline.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [AssetTimelineController],
  providers: [AssetTimelineService],
})
export class AssetTimelineModule {}
