import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { type Prisma, MappingState as PrismaMappingState } from '@prisma/client';
import { Test, type TestingModule } from '@nestjs/testing';
import { config as loadDotEnv } from 'dotenv';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Response interfaces ──────────────────────────────────────────────────────

interface MappingResponse {
  id: string;
  mappingType: string;
  systemId: string;
  capabilityId: string;
  state: string;
  attributes: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  capability: {
    id: string;
    uniqueName: string;
  };
}

interface MappingListResponse {
  items: MappingResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Env bootstrap ────────────────────────────────────────────────────────────

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

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('MappingController (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  const suitePrefix = `mapping-it-${randomUUID()}`;
  let testPrefix = suitePrefix;

  // ── App bootstrap ─────────────────────────────────────────────────────────

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
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.listen(0);
    baseUrl = `${await app.getUrl()}/api/v1`;
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    testPrefix = `${suitePrefix}-${randomUUID()}`;
  });

  function writeHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-user-id': 'integration-engineer-user',
      'x-user-role': 'integration-engineer',
    };
  }

  function deleteHeaders(): Record<string, string> {
    return {
      'x-user-id': 'integration-engineer-user',
      'x-user-role': 'integration-engineer',
    };
  }

  afterAll(async () => {
    // Clean up: delete mappings seeded by this suite, then their capabilities.
    await prisma.mapping.deleteMany({
      where: { systemId: { startsWith: suitePrefix } },
    });
    await prisma.capability.deleteMany({
      where: { uniqueName: { startsWith: suitePrefix } },
    });
    await app.close();
  });

  // ── Seed helpers ──────────────────────────────────────────────────────────

  async function seedCapability(name: string) {
    return prisma.capability.create({
      data: {
        id: randomUUID(),
        uniqueName: `${testPrefix}-${name}`,
        lifecycleStatus: 'ACTIVE',
        type: 'LEAF',
        branchOriginId: null,
      },
    });
  }

  async function seedMapping(
    capabilityId: string,
    overrides: Partial<{
      mappingType: string;
      systemId: string;
      state: PrismaMappingState;
      attributes: Record<string, unknown>;
    }> = {},
  ) {
    return prisma.mapping.create({
      data: {
        mappingType: overrides.mappingType ?? 'CONSUMES',
        systemId: overrides.systemId ?? `${testPrefix}-sys`,
        capabilityId,
        state: overrides.state ?? PrismaMappingState.ACTIVE,
        attributes:
          overrides.attributes != null
            ? (overrides.attributes as unknown as Prisma.InputJsonValue)
            : undefined,
      },
    });
  }

  // ── POST /mappings ────────────────────────────────────────────────────────

  describe('POST /mappings', () => {
    it('creates a mapping with default ACTIVE state', async () => {
      const cap = await seedCapability('create-cap');

      const res = await fetch(`${baseUrl}/mappings`, {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({
          mappingType: 'CONSUMES',
          systemId: `${testPrefix}-sys`,
          capabilityId: cap.id,
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as MappingResponse;
      expect(body.state).toBe('ACTIVE');
      expect(body.capabilityId).toBe(cap.id);
      expect(body.mappingType).toBe('CONSUMES');
      expect(body.capability).toBeDefined();
    });

    it('creates a mapping with explicit PENDING state', async () => {
      const cap = await seedCapability('create-pending-cap');

      const res = await fetch(`${baseUrl}/mappings`, {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({
          mappingType: 'PRODUCES',
          systemId: `${testPrefix}-sys`,
          capabilityId: cap.id,
          state: 'PENDING',
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as MappingResponse;
      expect(body.state).toBe('PENDING');
    });

    it('returns 400 when required field is missing', async () => {
      const res = await fetch(`${baseUrl}/mappings`, {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({ systemId: `${testPrefix}-sys` }), // missing mappingType + capabilityId
      });

      expect(res.status).toBe(400);
    });

    it('returns 404 when capability does not exist', async () => {
      const res = await fetch(`${baseUrl}/mappings`, {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({
          mappingType: 'CONSUMES',
          systemId: `${testPrefix}-sys`,
          capabilityId: randomUUID(), // non-existent
        }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 400 when capability is RETIRED', async () => {
      const cap = await prisma.capability.create({
        data: {
          id: randomUUID(),
          uniqueName: `${testPrefix}-retired-cap`,
          lifecycleStatus: 'RETIRED',
          type: 'LEAF',
          branchOriginId: null,
        },
      });

      const res = await fetch(`${baseUrl}/mappings`, {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({
          mappingType: 'CONSUMES',
          systemId: `${testPrefix}-sys`,
          capabilityId: cap.id,
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ── GET /mappings/:id ─────────────────────────────────────────────────────

  describe('GET /mappings/:id', () => {
    it('returns the mapping with embedded capability', async () => {
      const cap = await seedCapability('read-cap');
      const mapping = await seedMapping(cap.id);

      const res = await fetch(`${baseUrl}/mappings/${mapping.id}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as MappingResponse;
      expect(body.id).toBe(mapping.id);
      expect(body.capability.id).toBe(cap.id);
    });

    it('returns 404 for non-existent id', async () => {
      const res = await fetch(`${baseUrl}/mappings/${randomUUID()}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 for a non-UUID id', async () => {
      const res = await fetch(`${baseUrl}/mappings/not-a-uuid`);
      expect(res.status).toBe(400);
    });
  });

  // ── GET /mappings ─────────────────────────────────────────────────────────

  describe('GET /mappings', () => {
    it('returns paginated list with default pagination', async () => {
      const cap = await seedCapability('list-cap');
      await seedMapping(cap.id, { systemId: `${testPrefix}-list-sys` });
      await seedMapping(cap.id, { systemId: `${testPrefix}-list-sys` });

      const res = await fetch(
        `${baseUrl}/mappings?systemId=${encodeURIComponent(`${testPrefix}-list-sys`)}`,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as MappingListResponse;
      expect(body.items.length).toBeGreaterThanOrEqual(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(25);
      expect(typeof body.total).toBe('number');
    });

    it('filters by state', async () => {
      const cap = await seedCapability('state-filter-cap');
      await seedMapping(cap.id, {
        systemId: `${testPrefix}-state-sys`,
        state: PrismaMappingState.ACTIVE,
      });
      await seedMapping(cap.id, {
        systemId: `${testPrefix}-state-sys`,
        state: PrismaMappingState.INACTIVE,
      });

      const res = await fetch(
        `${baseUrl}/mappings?systemId=${encodeURIComponent(`${testPrefix}-state-sys`)}&state=ACTIVE`,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as MappingListResponse;
      expect(body.items.every((m) => m.state === 'ACTIVE')).toBe(true);
    });
  });

  // ── GET /capabilities/:id/mappings ────────────────────────────────────────

  describe('GET /capabilities/:id/mappings', () => {
    it('returns all mappings for a capability', async () => {
      const cap = await seedCapability('cap-mappings-cap');
      await seedMapping(cap.id, { systemId: `${testPrefix}-cap-sys-a` });
      await seedMapping(cap.id, { systemId: `${testPrefix}-cap-sys-b` });

      const res = await fetch(`${baseUrl}/capabilities/${cap.id}/mappings`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as MappingResponse[];
      expect(body.length).toBeGreaterThanOrEqual(2);
      expect(body.every((m) => m.capabilityId === cap.id)).toBe(true);
    });

    it('returns 404 when capability does not exist', async () => {
      const res = await fetch(`${baseUrl}/capabilities/${randomUUID()}/mappings`);
      expect(res.status).toBe(404);
    });
  });

  // ── GET /mappings/by-system/:systemId ─────────────────────────────────────

  describe('GET /mappings/by-system/:systemId', () => {
    it('returns all mappings for the given system', async () => {
      const cap = await seedCapability('by-sys-cap');
      const sysId = `${testPrefix}-by-system-id`;
      await seedMapping(cap.id, { systemId: sysId });
      await seedMapping(cap.id, { systemId: sysId });

      const res = await fetch(`${baseUrl}/mappings/by-system/${encodeURIComponent(sysId)}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as MappingResponse[];
      expect(body.length).toBeGreaterThanOrEqual(2);
      expect(body.every((m) => m.systemId === sysId)).toBe(true);
    });

    it('returns an empty array for a system with no mappings', async () => {
      const res = await fetch(`${baseUrl}/mappings/by-system/definitely-no-such-system`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as MappingResponse[];
      expect(Array.isArray(body)).toBe(true);
    });
  });

  // ── PATCH /mappings/:id ───────────────────────────────────────────────────

  describe('PATCH /mappings/:id', () => {
    it('updates the state to INACTIVE', async () => {
      const cap = await seedCapability('update-cap');
      const mapping = await seedMapping(cap.id);

      const res = await fetch(`${baseUrl}/mappings/${mapping.id}`, {
        method: 'PATCH',
        headers: writeHeaders(),
        body: JSON.stringify({ state: 'INACTIVE' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as MappingResponse;
      expect(body.state).toBe('INACTIVE');
    });

    it('updates mappingType and attributes together', async () => {
      const cap = await seedCapability('update-attr-cap');
      const mapping = await seedMapping(cap.id);

      const res = await fetch(`${baseUrl}/mappings/${mapping.id}`, {
        method: 'PATCH',
        headers: writeHeaders(),
        body: JSON.stringify({ mappingType: 'MANAGES', attributes: { version: 2 } }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as MappingResponse;
      expect(body.mappingType).toBe('MANAGES');
      expect(body.attributes).toEqual({ version: 2 });
    });

    it('returns 400 when no fields are provided', async () => {
      const cap = await seedCapability('update-empty-cap');
      const mapping = await seedMapping(cap.id);

      const res = await fetch(`${baseUrl}/mappings/${mapping.id}`, {
        method: 'PATCH',
        headers: writeHeaders(),
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('returns 404 for a non-existent mapping', async () => {
      const res = await fetch(`${baseUrl}/mappings/${randomUUID()}`, {
        method: 'PATCH',
        headers: writeHeaders(),
        body: JSON.stringify({ state: 'INACTIVE' }),
      });

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /mappings/:id ──────────────────────────────────────────────────

  describe('DELETE /mappings/:id', () => {
    it('deletes a mapping and returns 204', async () => {
      const cap = await seedCapability('delete-cap');
      const mapping = await seedMapping(cap.id);

      const res = await fetch(`${baseUrl}/mappings/${mapping.id}`, {
        method: 'DELETE',
        headers: deleteHeaders(),
      });

      expect(res.status).toBe(204);

      // Confirm it is gone
      const getRes = await fetch(`${baseUrl}/mappings/${mapping.id}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 when mapping does not exist', async () => {
      const res = await fetch(`${baseUrl}/mappings/${randomUUID()}`, {
        method: 'DELETE',
        headers: deleteHeaders(),
      });
      expect(res.status).toBe(404);
    });
  });
});

