import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { ConfigurationController } from './configuration.controller';
import { ConfigurationService } from './configuration.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [ConfigurationController],
  providers: [ConfigurationService],
})
export class ConfigurationModule {}
