import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthCoreModule } from '@capexbe/auth/auth-core.module';
import { SmartMigrationModule } from '@capexbe/smart-migration/smart-migration.module';
import { SharedModule } from '@capexbe/shared/shared.module';
import { JwtAuthGuard } from '@capexbe/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@capexbe/auth/guards/permissions.guard';
import { RolesGuard } from '@capexbe/auth/guards/roles.guard';
import { leafPinoHttpOptions } from '@capexbe/shared/leaf-pino.config';
import { AppController } from './app.controller';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: leafPinoHttpOptions(),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 400 }],
    }),
    SharedModule,
    AuthCoreModule,
    SmartMigrationModule,
  ],
  controllers: [AppController],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
