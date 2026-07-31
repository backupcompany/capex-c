import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { PoUpdateController } from './po-update.controller';
import { PoUpdateService } from './po-update.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [PoUpdateController],
  providers: [PoUpdateService],
})
export class PoUpdateModule {}
