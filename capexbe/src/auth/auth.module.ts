import { Global, Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthCoreModule } from './auth-core.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  imports: [AuthCoreModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, PermissionsGuard],
  exports: [AuthService, AuthCoreModule, JwtAuthGuard, RolesGuard, PermissionsGuard],
})
export class AuthModule {}
