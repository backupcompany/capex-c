import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { GrUpdateController } from './gr-update.controller';
import { GrUpdateService } from './gr-update.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [GrUpdateController],
  providers: [GrUpdateService],
})
export class GrUpdateModule {}
