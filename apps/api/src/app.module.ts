import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { CapabilityModule } from './capability/capability.module';
import { ChangeRequestModule } from './change-request/change-request.module';
import { VersioningModule } from './versioning/versioning.module';
import { MappingModule } from './mapping/mapping.module';
import { ImpactAnalysisModule } from './impact-analysis/impact-analysis.module';
import { AuditModule } from './audit/audit.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationModule } from './notification/notification.module';
import { IntegrationModule } from './integration/integration.module';
import { ExportModule } from './export/export.module';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { AppThrottlerGuard } from './common/http/app-throttler.guard';
import { RequestContextMiddleware } from './common/http/request-context.middleware';
import { RequestLoggingInterceptor } from './common/http/request-logging.interceptor';
import { SecurityHeadersMiddleware } from './common/http/security-headers.middleware';

const defaultRateLimitWindowSeconds = 60;
const defaultRateLimitRequestLimit = 120;

function readPositiveIntegerEnvironmentValue(
  rawValue: string | undefined,
  fallbackValue: number,
): number {
  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return Math.trunc(parsedValue);
}

function isRateLimitingEnabled(): boolean {
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMITING_FOR_TESTS !== 'true') {
    return false;
  }

  return process.env.API_RATE_LIMIT_ENABLED !== 'false';
}

@Module({
  controllers: [HealthController],
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        errorMessage: 'Too many requests. Please try again later.',
        setHeaders: true,
        skipIf: () => !isRateLimitingEnabled(),
        throttlers: [
          {
            name: 'default',
            ttl:
              readPositiveIntegerEnvironmentValue(
                process.env.API_RATE_LIMIT_TTL_SECONDS,
                defaultRateLimitWindowSeconds,
              ) * 1000,
            limit: readPositiveIntegerEnvironmentValue(
              process.env.API_RATE_LIMIT_LIMIT,
              defaultRateLimitRequestLimit,
            ),
          },
        ],
      }),
    }),
    PrismaModule,
    CapabilityModule,
    ChangeRequestModule,
    VersioningModule,
    MappingModule,
    ImpactAnalysisModule,
    AuditModule,
    AnalyticsModule,
    NotificationModule,
    IntegrationModule,
    ExportModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware, SecurityHeadersMiddleware).forRoutes({
      path: '*',
      method: RequestMethod.ALL,
    });
  }
}
