import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { config as loadDotEnv } from 'dotenv';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CapabilityImportFormat } from '../dto/import-capabilities.dto';

interface CapabilityImportResponse {
  canCommit: boolean;
  summary: {
    totalRows: number;
    readyCount: number;
    invalidRows: number;
    createdCount: number;
  };
  rows: Array<{
    rowNumber: number;
    uniqueName: string;
    parentUniqueName: string | null;
    action: 'CREATE';
    type: string;
    lifecycleStatus: string;
  }>;
  warnings: Array<{
    rowNumber: number;
    field: string;
    code: string;
  }>;
}

interface CapabilityImportCommitResponse extends CapabilityImportResponse {
  importId: string;
  created: Array<{
    rowNumber: number;
    capabilityId: string;
    uniqueName: string;
    parentUniqueName: string | null;
  }>;
}

interface ApiErrorResponse {
  statusCode: number;
  message: string;
  errors?: Array<{
    rowNumber: number;
    field: string;
    code: string;
  }>;
}

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

describe('CapabilityImportController (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  const suitePrefix = `capability-import-it-${randomUUID()}`;

  beforeAll(async () => {
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
    baseUrl = `${await app.getUrl()}/api/v1`;
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await cleanupByPrefix(suitePrefix);
  });

  afterAll(async () => {
    await cleanupByPrefix(suitePrefix);
    await app.close();
  });

  it('supports dry-run validation without persisting capabilities', async () => {
    const uniqueName = `${suitePrefix}-Payments`;
    const childName = `${suitePrefix}-Cards`;
    const response = await post<CapabilityImportResponse>('/capability-imports/dry-run', {
      format: CapabilityImportFormat.CSV,
      csvContent: `uniqueName,parentUniqueName\n${uniqueName},\n${childName},${uniqueName}`,
    });

    expect(response.status).toBe(200);
    expect(response.body.canCommit).toBe(true);
    expect(response.body.summary).toEqual({
      totalRows: 2,
      readyCount: 2,
      invalidRows: 0,
      createdCount: 0,
    });
    expect(response.body.rows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        uniqueName,
        action: 'CREATE',
        type: 'ABSTRACT',
      }),
      expect.objectContaining({
        rowNumber: 3,
        uniqueName: childName,
        parentUniqueName: uniqueName,
        action: 'CREATE',
        type: 'LEAF',
      }),
    ]);

    const persisted = await prisma.capability.findMany({
      where: {
        uniqueName: {
          in: [uniqueName, childName],
        },
      },
    });
    expect(persisted).toEqual([]);
  });

  it('commits a valid import and records audit entries', async () => {
    const uniqueName = `${suitePrefix}-Finance`;
    const childName = `${suitePrefix}-Payments`;
    const response = await post<CapabilityImportCommitResponse>('/capability-imports/commit', {
      format: CapabilityImportFormat.CSV,
      csvContent: `uniqueName,parentUniqueName\n${uniqueName},\n${childName},${uniqueName}`,
    });

    expect(response.status).toBe(201);
    expect(response.body.canCommit).toBe(true);
    expect(response.body.summary.createdCount).toBe(2);
    expect(response.body.created).toHaveLength(2);

    const persisted = await prisma.capability.findMany({
      where: {
        uniqueName: {
          in: [uniqueName, childName],
        },
      },
      orderBy: {
        uniqueName: 'asc',
      },
    });

    expect(persisted).toHaveLength(2);
    const parent = persisted.find((capability) => capability.uniqueName === uniqueName);
    const child = persisted.find((capability) => capability.uniqueName === childName);
    expect(parent).toBeDefined();
    expect(child?.parentId).toBe(parent?.id);

    const auditEntries = await prisma.auditEntry.findMany({
      where: {
        entityId: {
          in: persisted.map((capability) => capability.id),
        },
        actorId: 'integration-user',
      },
    });
    expect(auditEntries).toHaveLength(2);
    expect(auditEntries[0]?.action).toBe('CREATE');
  });

  it('rejects commit when a capability name already exists', async () => {
    const uniqueName = `${suitePrefix}-Existing`;
    await prisma.capability.create({
      data: {
        uniqueName,
        aliases: [],
        sourceReferences: [],
        tags: [],
      },
    });

    const response = await post<ApiErrorResponse>('/capability-imports/commit', {
      format: CapabilityImportFormat.CSV,
      csvContent: `uniqueName\n${uniqueName}`,
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Capability import validation failed');
    expect(response.body.errors).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        field: 'uniqueName',
        code: 'EXISTING_CONFLICT',
      }),
    ]);
  });

  async function post<T>(
    path: string,
    body: unknown,
  ): Promise<{ status: number; body: T }> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'integration-user',
        'x-user-role': 'curator',
      },
      body: JSON.stringify(body),
    });

    return {
      status: response.status,
      body: (await response.json()) as T,
    };
  }

  async function cleanupByPrefix(prefix: string): Promise<void> {
    const capabilities = await prisma.capability.findMany({
      where: {
        uniqueName: {
          startsWith: prefix,
        },
      },
      select: {
        id: true,
      },
    });

    const capabilityIds = capabilities.map((capability) => capability.id);

    if (capabilityIds.length > 0) {
      await prisma.auditEntry.deleteMany({
        where: {
          entityId: {
            in: capabilityIds,
          },
        },
      });
      await prisma.capabilityVersion.deleteMany({
        where: {
          capabilityId: {
            in: capabilityIds,
          },
        },
      });

      while (true) {
        const { count } = await prisma.capability.deleteMany({
          where: {
            id: {
              in: capabilityIds,
            },
            children: {
              none: {},
            },
          },
        });

        if (count === 0) {
          break;
        }
      }
    }
  }
});
