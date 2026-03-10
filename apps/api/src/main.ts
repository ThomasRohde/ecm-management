import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { config as loadDotEnv } from 'dotenv';
import { AppModule } from './app.module';

function loadEnvironment(): void {
  const candidatePaths = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];

  for (const envPath of candidatePaths) {
    if (existsSync(envPath)) {
      loadDotEnv({ path: envPath, override: false });
    }
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

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

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  await app.listen(port);
  console.log(`ECM API running on http://localhost:${port}/api/v1`);
}

loadEnvironment();
bootstrap();
