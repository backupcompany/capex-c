import { Global, Module } from '@nestjs/common';
import { AuthController } from '@capexbe/auth/auth.controller';
import { AuthService } from '@capexbe/auth/auth.service';
import { AuthCoreModule } from '../../../packages/capex-auth-core/src/auth-core.module';

/** Auth HTTP routes without duplicating guard providers (APP_GUARD lives in AppModule). */
@Global()
@Module({
  imports: [AuthCoreModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, AuthCoreModule],
})
export class AuthLeafModule {}
