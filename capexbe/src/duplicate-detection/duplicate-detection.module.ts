import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { DuplicateDetectionController } from './duplicate-detection.controller';
import { DuplicateDetectionService } from './duplicate-detection.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [DuplicateDetectionController],
  providers: [DuplicateDetectionService],
  exports: [DuplicateDetectionService],
})
export class DuplicateDetectionModule {}
