import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { config as loadDotEnv } from 'dotenv';
import { AppModule } from './app.module';

function loadIntegrationEnvironment(): void {
  const candidatePaths = [
    resolve(process.cwd(), '.env.test.local'),
    resolve(process.cwd(), '.env.test'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ];

  for (const envPath of candidatePaths) {
    if (existsSync(envPath)) {
      loadDotEnv({ path: envPath, override: false, quiet: true });
    }
  }

  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('Integration tests require DATABASE_URL or TEST_DATABASE_URL to be set');
  }

  const hostname = new URL(databaseUrl).hostname;
  if (!['localhost', '127.0.0.1'].includes(hostname)) {
    throw new Error(
      `Integration tests only run against a local Postgres database, received host "${hostname}"`,
    );
  }
}

loadIntegrationEnvironment();

describe('App hardening (integration)', () => {
  let app: INestApplication;
  const originalRateLimitWindow = process.env.API_RATE_LIMIT_TTL_SECONDS;
  const originalRateLimitLimit = process.env.API_RATE_LIMIT_LIMIT;
  const originalRateLimitingForTests = process.env.ENABLE_RATE_LIMITING_FOR_TESTS;

  beforeAll(async () => {
    process.env.API_RATE_LIMIT_TTL_SECONDS = '60';
    process.env.API_RATE_LIMIT_LIMIT = '2';
    process.env.ENABLE_RATE_LIMITING_FOR_TESTS = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    await app.listen(0);
  });

  afterAll(async () => {
    process.env.API_RATE_LIMIT_TTL_SECONDS = originalRateLimitWindow;
    process.env.API_RATE_LIMIT_LIMIT = originalRateLimitLimit;
    process.env.ENABLE_RATE_LIMITING_FOR_TESTS = originalRateLimitingForTests;
    await app.close();
  });

  it('skips throttling for health probes and rate limits normal API routes', async () => {
    const baseUrl = await app.getUrl();

    await expect(fetch(`${baseUrl}/api/v1/health/live`)).resolves.toMatchObject({
      status: 200,
    });
    await expect(fetch(`${baseUrl}/api/v1/health/live`)).resolves.toMatchObject({
      status: 200,
    });
    await expect(fetch(`${baseUrl}/api/v1/health/ready`)).resolves.toMatchObject({
      status: 200,
    });

    const requestId = `rate-limit-${randomUUID()}`;
    const headers = {
      'x-request-id': requestId,
      'x-forwarded-for': '203.0.113.10',
    };

    await expect(
      fetch(`${baseUrl}/api/v1/capabilities`, {
        headers,
      }),
    ).resolves.toMatchObject({
      status: 200,
    });
    await expect(
      fetch(`${baseUrl}/api/v1/capabilities`, {
        headers,
      }),
    ).resolves.toMatchObject({
      status: 200,
    });
    const throttledResponse = await fetch(`${baseUrl}/api/v1/capabilities`, {
      headers,
    });

    expect(throttledResponse.status).toBe(429);
    await expect(throttledResponse.json()).resolves.toEqual({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        details: {
          requestId,
        },
      },
    });
  });
});
