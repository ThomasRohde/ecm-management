import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.assertDatabaseReady();

    return {
      data: {
        status: 'ok' as const,
      },
    };
  }

  @Get('live')
  live() {
    return {
      data: {
        status: 'ok' as const,
      },
    };
  }

  @Get('ready')
  async ready() {
    await this.assertDatabaseReady();

    return {
      data: {
        status: 'ok' as const,
        checks: {
          database: 'ok' as const,
        },
      },
    };
  }

  private async assertDatabaseReady(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        error: {
          code: 'API_NOT_READY',
          message: 'API is not ready',
          details: {
            database: 'unavailable',
          },
        },
      });
    }
  }
}
