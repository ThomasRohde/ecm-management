import { HealthController } from './health.controller';
import type { PrismaService } from './prisma/prisma.service';

describe('HealthController', () => {
  const prisma = {
    $queryRaw: jest.fn(),
  };

  const controller = new HealthController(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should report ok when Prisma is reachable', async () => {
    prisma.$queryRaw.mockResolvedValue(1);

    await expect(controller.check()).resolves.toEqual({
      data: {
        status: 'ok',
      },
    });
  });

  it('should report liveness without touching Prisma', async () => {
    await expect(controller.live()).toEqual({
      data: {
        status: 'ok',
      },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('should report readiness details when Prisma is reachable', async () => {
    prisma.$queryRaw.mockResolvedValue(1);

    await expect(controller.ready()).resolves.toEqual({
      data: {
        status: 'ok',
        checks: {
          database: 'ok',
        },
      },
    });
  });

  it('should surface an API_NOT_READY response when Prisma is unavailable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('database unavailable'));

    await expect(controller.check()).rejects.toMatchObject({
      response: {
        error: {
          code: 'API_NOT_READY',
          message: 'API is not ready',
          details: {
            database: 'unavailable',
          },
        },
      },
      status: 503,
    });
  });
});
