import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { SharedModule } from './shared/shared.module';
import { RedisThrottlerStorage } from './shared/redis-throttler-storage.service';
import { ProjectListModule } from './project-list/project-list.module';
import { SmartMigrationModule } from './smart-migration/smart-migration.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { BudgetHuModule } from './budget-hu/budget-hu.module';
import { MyTasksModule } from './my-tasks/my-tasks.module';
import { TaskActionsModule } from './task-actions/task-actions.module';
import { UserAdminModule } from './user-admin/user-admin.module';
import { ConfigurationModule } from './configuration/configuration.module';
import { AssetTimelineModule } from './asset-timeline/asset-timeline.module';
import { FsModule } from './fs/fs.module';
import { FsUpdateModule } from './fs-update/fs-update.module';
import { FsApprovalModule } from './fs-approval/fs-approval.module';
import { FsRealizationModule } from './fs-realization/fs-realization.module';
import { ExecutiveSummaryModule } from './executive-summary/executive-summary.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { DuplicateDetectionModule } from './duplicate-detection/duplicate-detection.module';
import { PoUpdateModule } from './po-update/po-update.module';
import { GrUpdateModule } from './gr-update/gr-update.module';
import { MomDailySummaryModule } from './mom-daily-summary/mom-daily-summary.module';
import { BudgetMultiYearModule } from './budget-multi-year/budget-multi-year.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { BackupModule } from './backup/backup.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        autoLogging: false,
        transport:
          process.env.NODE_ENV !== 'production' && process.env.PINO_PRETTY !== '0'
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
            : undefined,
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 400 }],
      storage: new RedisThrottlerStorage(),
    }),
    SharedModule,
    AuthModule,
    ProjectListModule,
    DuplicateDetectionModule,
    AssetTimelineModule,
    SmartMigrationModule,
    BootstrapModule,
    DashboardModule,
    BudgetHuModule,
    MyTasksModule,
    TaskActionsModule,
    UserAdminModule,
    ConfigurationModule,
    FsModule,
    FsUpdateModule,
    FsApprovalModule,
    FsRealizationModule,
    ExecutiveSummaryModule,
    MonitoringModule,
    PoUpdateModule,
    GrUpdateModule,
    MomDailySummaryModule,
    BudgetMultiYearModule,
    NotificationsModule,
    AuditModule,
    BackupModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
