import { Global, Module } from '@nestjs/common';

import { AuthController } from './auth.controller';

import { AuthService } from './auth.service';

import { AuthCoreModule } from './auth-core.module';

@Global()
@Module({
  imports: [AuthCoreModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, PermissionsGuard],
  exports: [AuthService, AuthCoreModule, JwtAuthGuard, RolesGuard, PermissionsGuard],
})
export class AuthModule {}
