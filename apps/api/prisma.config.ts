import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

const candidatePaths = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];

for (const envPath of candidatePaths) {
  if (existsSync(envPath)) {
    loadDotEnv({ path: envPath, override: false });
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --project tsconfig.prisma.json prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
