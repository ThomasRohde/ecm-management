import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import {
  CapabilityType as PrismaCapabilityType,
  LifecycleStatus as PrismaLifecycleStatus,
} from '@prisma/client';
import { Test, type TestingModule } from '@nestjs/testing';
import { config as loadDotEnv } from 'dotenv';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CapabilityType as ApiCapabilityType,
  LifecycleStatus as ApiLifecycleStatus,
} from '../dto/create-capability.dto';

interface CapabilityResponse {
  id: string;
  uniqueName: string;
  aliases: string[];
  description: string | null;
  domain: string | null;
  type: string;
  parentId: string | null;
  lifecycleStatus: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  rationale: string | null;
  sourceReferences: string[];
  tags: string[];
  stewardId: string | null;
  stewardDepartment: string | null;
  nameGuardrailOverride: boolean;
  nameGuardrailOverrideRationale: string | null;
  guardrailWarnings?: Array<{
    code: string;
    message: string;
    matchedTerms: string[];
    overrideApplied: boolean;
    overrideRationale: string | null;
  }>;
  parent?: {
    id: string;
    uniqueName: string;
  } | null;
  children?: Array<{
    id: string;
    uniqueName: string;
    type: string;
  }>;
}

interface CapabilityListItem {
  id: string;
  uniqueName: string;
  domain: string | null;
  type: string;
  lifecycleStatus: string;
  children: Array<{ id: string }>;
}

interface CapabilityListResponse {
  items: CapabilityListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface BreadcrumbItem {
  id: string;
  uniqueName: string;
}

interface CapabilitySubtreeResponse {
  id: string;
  uniqueName: string;
  children: CapabilitySubtreeResponse[];
}

interface CapabilityStewardshipResponse {
  capabilityId: string;
  stewardId: string | null;
  stewardDepartment: string | null;
  source: 'DIRECT' | 'INHERITED' | 'UNASSIGNED';
  sourceCapabilityId: string | null;
}

interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
}

interface SeedCapabilityOverrides {
  uniqueName: string;
  aliases?: string[];
  description?: string | null;
  domain?: string | null;
  type?: PrismaCapabilityType;
  parentId?: string | null;
  lifecycleStatus?: PrismaLifecycleStatus;
  rationale?: string | null;
  sourceReferences?: string[];
  tags?: string[];
  stewardId?: string | null;
  stewardDepartment?: string | null;
  nameGuardrailOverride?: boolean;
  nameGuardrailOverrideRationale?: string | null;
}

interface FlaggedCapabilityReviewItem {
  id: string;
  uniqueName: string;
  lifecycleStatus: string;
  domain: string | null;
  stewardId: string | null;
  stewardDepartment: string | null;
  nameGuardrailOverride: boolean;
  nameGuardrailOverrideRationale: string | null;
  matchedTerms: string[];
  warningMessage: string;
}

interface FlaggedCapabilityListResponse {
  items: FlaggedCapabilityReviewItem[];
  page: number;
  limit: number;
  hasMore: boolean;
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

describe('CapabilityController (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  const suitePrefix = `capability-it-${randomUUID()}`;
  let testPrefix = suitePrefix;

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

  beforeEach(() => {
    testPrefix = `${suitePrefix}-${randomUUID()}`;
  });

  afterEach(async () => {
    await deleteCapabilitiesByPrefix(testPrefix);
  });

  afterAll(async () => {
    await deleteCapabilitiesByPrefix(suitePrefix);
    await app.close();
  });

  describe('POST /capabilities', () => {
    it('should create a capability and persist representative metadata', async () => {
      const uniqueName = capabilityName('payments');
      const response = await sendJson<CapabilityResponse>('POST', '/capabilities', {
        uniqueName,
        aliases: ['Payment Processing'],
        description: 'Supports inbound and outbound payment execution',
        domain: 'Finance',
        type: ApiCapabilityType.LEAF,
        lifecycleStatus: ApiLifecycleStatus.DRAFT,
        effectiveFrom: '2026-03-01T00:00:00.000Z',
        rationale: 'Required for payment operations',
        sourceReferences: ['RFC-101'],
        tags: ['payments', 'core'],
        stewardId: 'steward-123',
        stewardDepartment: 'Finance Architecture',
      });

      expect(response.status).toBe(201);
      expect(response.body.uniqueName).toBe(uniqueName);
      expect(response.body.type).toBe(ApiCapabilityType.LEAF);
      expect(response.body.tags).toEqual(['payments', 'core']);

      const persisted = await prisma.capability.findUnique({
        where: { id: response.body.id },
      });

      expect(persisted).not.toBeNull();
      expect(persisted).toMatchObject({
        uniqueName,
        aliases: ['Payment Processing'],
        description: 'Supports inbound and outbound payment execution',
        domain: 'Finance',
        type: PrismaCapabilityType.LEAF,
        lifecycleStatus: PrismaLifecycleStatus.DRAFT,
        rationale: 'Required for payment operations',
        sourceReferences: ['RFC-101'],
        tags: ['payments', 'core'],
        stewardId: 'steward-123',
        stewardDepartment: 'Finance Architecture',
      });
      expect(persisted?.effectiveFrom?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    });

    it('should reject invalid DTO payloads through the Nest validation pipeline', async () => {
      const response = await sendJson<ApiErrorResponse>('POST', '/capabilities', {
        uniqueName: '',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain(
        'uniqueName must be longer than or equal to 1 characters',
      );
    });

    it('should reject duplicate capability names', async () => {
      const uniqueName = capabilityName('duplicate-name');
      await seedCapability({ uniqueName });

      const response = await sendJson<ApiErrorResponse>('POST', '/capabilities', {
        uniqueName,
      });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe(`Capability name "${uniqueName}" is already in use`);
    });

    it('should reject creating an active capability without the mandatory metadata', async () => {
      const response = await sendJson<ApiErrorResponse>('POST', '/capabilities', {
        uniqueName: capabilityName('active-missing-metadata'),
        lifecycleStatus: ApiLifecycleStatus.ACTIVE,
        description: 'Supports payment processing',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'Active lifecycle status requires the following fields to be populated: domain, stewardId, stewardDepartment',
      );
    });

    it('should create flagged capabilities with a warning instead of blocking the request', async () => {
      const uniqueName = `${capabilityName('salesforce')}-Salesforce order orchestration`;
      const response = await sendJson<CapabilityResponse>('POST', '/capabilities', {
        uniqueName,
      });

      expect(response.status).toBe(201);
      expect(response.body.guardrailWarnings).toEqual([
        expect.objectContaining({
          code: 'CAPABILITY_NAME_GUARDRAIL',
          matchedTerms: ['salesforce'],
          overrideApplied: false,
        }),
      ]);

      const persisted = await prisma.capability.findUnique({
        where: { id: response.body.id },
      });

      expect(persisted).toMatchObject({
        nameGuardrailOverride: false,
        nameGuardrailOverrideRationale: null,
      });
    });

    it('should require rationale when overriding a flagged capability name', async () => {
      const response = await sendJson<ApiErrorResponse>('POST', '/capabilities', {
        uniqueName: 'SAP integration support',
        nameGuardrailOverride: true,
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'Capability name guardrail overrides require a rationale when the name matches the configured blocklist',
      );
    });
  });

  describe('GET /capabilities', () => {
    it('should filter, paginate, and sort matching capabilities', async () => {
      await seedCapability({
        uniqueName: capabilityName('beta'),
        domain: 'Finance',
        lifecycleStatus: PrismaLifecycleStatus.ACTIVE,
      });
      await seedCapability({
        uniqueName: capabilityName('alpha'),
        domain: 'Finance',
        lifecycleStatus: PrismaLifecycleStatus.DRAFT,
      });
      await seedCapability({
        uniqueName: capabilityName('operations'),
        domain: 'Operations',
      });

      const response = await getJson<CapabilityListResponse>(
        `/capabilities?search=${encodeURIComponent(testPrefix)}&domain=Finance&page=1&limit=1`,
      );

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(1);
      expect(response.body.totalPages).toBe(2);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0]?.uniqueName).toBe(capabilityName('alpha'));
    });
  });

  describe('GET /capabilities/:id', () => {
    it('should return the requested capability with parent and child references', async () => {
      const root = await seedCapability({
        uniqueName: capabilityName('root'),
      });
      const middle = await seedCapability({
        uniqueName: capabilityName('middle'),
        parentId: root.id,
      });
      const leaf = await seedCapability({
        uniqueName: capabilityName('leaf'),
        parentId: middle.id,
        type: PrismaCapabilityType.LEAF,
      });

      const response = await getJson<CapabilityResponse>(`/capabilities/${middle.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(middle.id);
      expect(response.body.parent).toEqual({
        id: root.id,
        uniqueName: root.uniqueName,
      });
      expect(response.body.children).toEqual([
        {
          id: leaf.id,
          uniqueName: leaf.uniqueName,
          type: PrismaCapabilityType.LEAF,
        },
      ]);
    });
  });

  describe('PATCH /capabilities/:id', () => {
    it('should update capability fields and allow valid re-parenting', async () => {
      const currentParent = await seedCapability({
        uniqueName: capabilityName('current-parent'),
      });
      const nextParent = await seedCapability({
        uniqueName: capabilityName('next-parent'),
      });
      const capability = await seedCapability({
        uniqueName: capabilityName('capability'),
        parentId: currentParent.id,
        tags: ['legacy'],
      });
      const updatedName = capabilityName('capability-updated');

      const response = await sendJson<CapabilityResponse>(
        'PATCH',
        `/capabilities/${capability.id}`,
        {
          uniqueName: updatedName,
          description: 'Updated by integration test',
          domain: 'Enterprise Architecture',
          parentId: nextParent.id,
          lifecycleStatus: ApiLifecycleStatus.ACTIVE,
          tags: ['updated'],
          stewardId: 'steward-456',
          stewardDepartment: 'Enterprise Architecture',
        },
      );

      expect(response.status).toBe(200);
      expect(response.body.uniqueName).toBe(updatedName);
      expect(response.body.parentId).toBe(nextParent.id);
      expect(response.body.lifecycleStatus).toBe(ApiLifecycleStatus.ACTIVE);

      const persisted = await prisma.capability.findUnique({
        where: { id: capability.id },
      });

      expect(persisted).not.toBeNull();
      expect(persisted).toMatchObject({
        uniqueName: updatedName,
        description: 'Updated by integration test',
        domain: 'Enterprise Architecture',
        parentId: nextParent.id,
        lifecycleStatus: PrismaLifecycleStatus.ACTIVE,
        tags: ['updated'],
        stewardId: 'steward-456',
        stewardDepartment: 'Enterprise Architecture',
      });
    });

    it('should allow transitioning to active when the capability already has the mandatory metadata', async () => {
      const capability = await seedCapability({
        uniqueName: capabilityName('ready-for-active'),
        description: 'Supports payment operations',
        domain: 'Finance',
        stewardId: 'steward-123',
        stewardDepartment: 'Finance Architecture',
      });

      const response = await sendJson<CapabilityResponse>(
        'PATCH',
        `/capabilities/${capability.id}`,
        {
          lifecycleStatus: ApiLifecycleStatus.ACTIVE,
        },
      );

      expect(response.status).toBe(200);
      expect(response.body.lifecycleStatus).toBe(ApiLifecycleStatus.ACTIVE);

      const persisted = await prisma.capability.findUnique({
        where: { id: capability.id },
      });

      expect(persisted?.lifecycleStatus).toBe(PrismaLifecycleStatus.ACTIVE);
      expect(persisted).toMatchObject({
        description: 'Supports payment operations',
        domain: 'Finance',
        stewardId: 'steward-123',
        stewardDepartment: 'Finance Architecture',
      });
    });

    it('should reject transitioning to active when required metadata is still missing', async () => {
      const capability = await seedCapability({
        uniqueName: capabilityName('missing-active-metadata'),
        description: 'Supports payment operations',
        stewardId: 'steward-123',
        stewardDepartment: 'Finance Architecture',
      });

      const response = await sendJson<ApiErrorResponse>(
        'PATCH',
        `/capabilities/${capability.id}`,
        {
          lifecycleStatus: ApiLifecycleStatus.ACTIVE,
        },
      );

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'Active lifecycle status requires the following fields to be populated: domain',
      );
    });

    it('should reject assigning a capability to one of its descendants', async () => {
      const root = await seedCapability({
        uniqueName: capabilityName('root'),
      });
      const child = await seedCapability({
        uniqueName: capabilityName('child'),
        parentId: root.id,
      });
      const grandchild = await seedCapability({
        uniqueName: capabilityName('grandchild'),
        parentId: child.id,
      });

      const response = await sendJson<ApiErrorResponse>('PATCH', `/capabilities/${root.id}`, {
        parentId: grandchild.id,
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'A capability cannot be assigned to one of its descendant capabilities',
      );
    });

    it('should persist an override rationale when explicitly approved during update', async () => {
      const capability = await seedCapability({
        uniqueName: capabilityName('guardrail-target'),
      });
      const uniqueName = `${capabilityName('servicenow')}-ServiceNow request fulfilment`;

      const response = await sendJson<CapabilityResponse>(
        'PATCH',
        `/capabilities/${capability.id}`,
        {
          uniqueName,
          nameGuardrailOverride: true,
          nameGuardrailOverrideRationale: 'Stewardship-approved shared language',
        },
      );

      expect(response.status).toBe(200);
      expect(response.body.guardrailWarnings).toEqual([
        expect.objectContaining({
          matchedTerms: ['servicenow'],
          overrideApplied: true,
          overrideRationale: 'Stewardship-approved shared language',
        }),
      ]);

      const persisted = await prisma.capability.findUnique({
        where: { id: capability.id },
      });

      expect(persisted).toMatchObject({
        uniqueName,
        nameGuardrailOverride: true,
        nameGuardrailOverrideRationale: 'Stewardship-approved shared language',
      });
    });
  });

  describe('GET /guardrails/flagged', () => {
    it('should return flagged capabilities for stewardship review', async () => {
      const uniqueName = `${capabilityName('slack')}-Slack collaboration workflow`;
      const flagged = await seedCapability({
        uniqueName,
        domain: 'Collaboration',
        stewardId: 'steward-123',
        stewardDepartment: 'EA',
        nameGuardrailOverride: true,
        nameGuardrailOverrideRationale: 'Stewardship-approved term',
      });
      await seedCapability({
        uniqueName: capabilityName('clean-capability'),
      });

      const response = await getJson<FlaggedCapabilityListResponse>('/guardrails/flagged');
      const matchingItems = response.body.items.filter((item) => item.uniqueName.startsWith(testPrefix));

      expect(response.status).toBe(200);
      expect(matchingItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: flagged.id,
            uniqueName,
            matchedTerms: ['slack'],
            nameGuardrailOverride: true,
            nameGuardrailOverrideRationale: 'Stewardship-approved term',
          }),
        ]),
      );
      expect(matchingItems).toHaveLength(1);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(25);
      expect(response.body.hasMore).toBeDefined();
    });
  });

  describe('Hierarchy endpoints', () => {
    it('should return sorted children and breadcrumbs for a nested hierarchy', async () => {
      const root = await seedCapability({
        uniqueName: capabilityName('root'),
      });
      const childB = await seedCapability({
        uniqueName: capabilityName('child-b'),
        parentId: root.id,
      });
      const childA = await seedCapability({
        uniqueName: capabilityName('child-a'),
        parentId: root.id,
      });
      const grandchild = await seedCapability({
        uniqueName: capabilityName('grandchild'),
        parentId: childA.id,
        type: PrismaCapabilityType.LEAF,
      });

      const childrenResponse = await getJson<CapabilityResponse[]>(
        `/capabilities/${root.id}/children`,
      );
      const breadcrumbsResponse = await getJson<BreadcrumbItem[]>(
        `/capabilities/${grandchild.id}/breadcrumbs`,
      );

      expect(childrenResponse.status).toBe(200);
      expect(childrenResponse.body.map((item) => item.uniqueName)).toEqual([
        childA.uniqueName,
        childB.uniqueName,
      ]);

      expect(breadcrumbsResponse.status).toBe(200);
      expect(breadcrumbsResponse.body).toEqual([
        { id: root.id, uniqueName: root.uniqueName },
        { id: childA.id, uniqueName: childA.uniqueName },
        { id: grandchild.id, uniqueName: grandchild.uniqueName },
      ]);
    });

    it('should return a nested subtree and the leaf capabilities beneath it', async () => {
      const root = await seedCapability({
        uniqueName: capabilityName('root'),
      });
      const branch = await seedCapability({
        uniqueName: capabilityName('branch'),
        parentId: root.id,
      });
      const directLeaf = await seedCapability({
        uniqueName: capabilityName('direct-leaf'),
        parentId: root.id,
        type: PrismaCapabilityType.LEAF,
      });
      const nestedLeaf = await seedCapability({
        uniqueName: capabilityName('nested-leaf'),
        parentId: branch.id,
        type: PrismaCapabilityType.LEAF,
      });

      const subtreeResponse = await getJson<CapabilitySubtreeResponse>(
        `/capabilities/${root.id}/subtree`,
      );
      const leavesResponse = await getJson<CapabilityResponse[]>(`/capabilities/${root.id}/leaves`);

      expect(subtreeResponse.status).toBe(200);
      expect(subtreeResponse.body.id).toBe(root.id);
      expect(subtreeResponse.body.children).toHaveLength(2);
      expect(subtreeResponse.body.children.map((child) => child.uniqueName)).toEqual([
        branch.uniqueName,
        directLeaf.uniqueName,
      ]);
      expect(subtreeResponse.body.children[0]?.children).toEqual([
        expect.objectContaining({
          id: nestedLeaf.id,
          uniqueName: nestedLeaf.uniqueName,
        }),
      ]);

      expect(leavesResponse.status).toBe(200);
      expect(leavesResponse.body.map((capability) => capability.uniqueName)).toEqual([
        directLeaf.uniqueName,
        nestedLeaf.uniqueName,
      ]);
    });
  });

  describe('GET /capabilities/:id/stewardship', () => {
    it('should return direct stewardship for a directly assigned capability', async () => {
      const capability = await seedCapability({
        uniqueName: capabilityName('direct-stewardship'),
        stewardId: 'steward-direct',
        stewardDepartment: 'Direct Department',
      });

      const response = await getJson<CapabilityStewardshipResponse>(
        `/capabilities/${capability.id}/stewardship`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        capabilityId: capability.id,
        stewardId: 'steward-direct',
        stewardDepartment: 'Direct Department',
        source: 'DIRECT',
        sourceCapabilityId: capability.id,
      });
    });

    it('should return inherited stewardship from an assigned parent subtree', async () => {
      const root = await seedCapability({
        uniqueName: capabilityName('inherited-root'),
        stewardId: 'steward-root',
        stewardDepartment: 'Root Department',
      });
      const child = await seedCapability({
        uniqueName: capabilityName('inherited-child'),
        parentId: root.id,
      });

      const response = await getJson<CapabilityStewardshipResponse>(
        `/capabilities/${child.id}/stewardship`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        capabilityId: child.id,
        stewardId: 'steward-root',
        stewardDepartment: 'Root Department',
        source: 'INHERITED',
        sourceCapabilityId: root.id,
      });
    });

    it('should honor a child override for descendants in the subtree', async () => {
      const root = await seedCapability({
        uniqueName: capabilityName('override-root'),
        stewardId: 'steward-root',
        stewardDepartment: 'Root Department',
      });
      const child = await seedCapability({
        uniqueName: capabilityName('override-child'),
        parentId: root.id,
        stewardId: 'steward-child',
        stewardDepartment: 'Child Department',
      });
      const grandchild = await seedCapability({
        uniqueName: capabilityName('override-grandchild'),
        parentId: child.id,
      });

      const response = await getJson<CapabilityStewardshipResponse>(
        `/capabilities/${grandchild.id}/stewardship`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        capabilityId: grandchild.id,
        stewardId: 'steward-child',
        stewardDepartment: 'Child Department',
        source: 'INHERITED',
        sourceCapabilityId: child.id,
      });
    });

    it('should return unassigned when no ancestor has a complete direct stewardship assignment', async () => {
      const root = await seedCapability({
        uniqueName: capabilityName('unassigned-root'),
        stewardId: 'steward-root',
      });
      const child = await seedCapability({
        uniqueName: capabilityName('unassigned-child'),
        parentId: root.id,
      });

      const response = await getJson<CapabilityStewardshipResponse>(
        `/capabilities/${child.id}/stewardship`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        capabilityId: child.id,
        stewardId: null,
        stewardDepartment: null,
        source: 'UNASSIGNED',
        sourceCapabilityId: null,
      });
    });

    it('should return a typed not-found error when the capability does not exist', async () => {
      const response = await getJson<ApiErrorResponse>(`/capabilities/${randomUUID()}/stewardship`);

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/Capability with ID ".+" not found/);
      expect(response.body.error).toBe('Not Found');
    });
  });

  describe('DELETE /capabilities/:id', () => {
    it('should delete a draft leaf capability', async () => {
      const capability = await seedCapability({
        uniqueName: capabilityName('delete-me'),
        type: PrismaCapabilityType.LEAF,
      });

      const response = await fetch(`${baseUrl}/capabilities/${capability.id}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': 'integration-curator',
          'x-user-role': 'curator',
        },
      });

      expect(response.status).toBe(204);
      await expect(
        prisma.capability.findUnique({
          where: { id: capability.id },
        }),
      ).resolves.toBeNull();
    });

    it('should reject deleting non-draft or parent capabilities', async () => {
      const activeCapability = await seedCapability({
        uniqueName: capabilityName('active'),
        lifecycleStatus: PrismaLifecycleStatus.ACTIVE,
      });
      const parentCapability = await seedCapability({
        uniqueName: capabilityName('parent'),
      });
      await seedCapability({
        uniqueName: capabilityName('child'),
        parentId: parentCapability.id,
      });

      const activeDeleteResponse = await deleteJson<ApiErrorResponse>(
        `/capabilities/${activeCapability.id}`,
      );
      const parentDeleteResponse = await deleteJson<ApiErrorResponse>(
        `/capabilities/${parentCapability.id}`,
      );

      expect(activeDeleteResponse.status).toBe(400);
      expect(activeDeleteResponse.body.message).toBe('Only draft capabilities can be deleted');
      expect(parentDeleteResponse.status).toBe(400);
      expect(parentDeleteResponse.body.message).toBe(
        'Capabilities with child capabilities cannot be deleted',
      );
    });
  });

  function capabilityName(suffix: string): string {
    return `${testPrefix}-${suffix}`;
  }

  async function seedCapability(overrides: SeedCapabilityOverrides) {
    return prisma.capability.create({
      data: {
        uniqueName: overrides.uniqueName,
        aliases: overrides.aliases ?? [],
        description: overrides.description ?? null,
        domain: overrides.domain ?? null,
        type: overrides.type ?? PrismaCapabilityType.ABSTRACT,
        parentId: overrides.parentId ?? null,
        lifecycleStatus: overrides.lifecycleStatus ?? PrismaLifecycleStatus.DRAFT,
        rationale: overrides.rationale ?? null,
        sourceReferences: overrides.sourceReferences ?? [],
        tags: overrides.tags ?? [],
        stewardId: overrides.stewardId ?? null,
        stewardDepartment: overrides.stewardDepartment ?? null,
        nameGuardrailOverride: overrides.nameGuardrailOverride ?? false,
        nameGuardrailOverrideRationale: overrides.nameGuardrailOverrideRationale ?? null,
      },
    });
  }

  async function getJson<T>(path: string): Promise<{ status: number; body: T }> {
    const response = await fetch(`${baseUrl}${path}`);

    return {
      status: response.status,
      body: (await response.json()) as T,
    };
  }

  async function sendJson<T>(
    method: 'POST' | 'PATCH',
    path: string,
    payload: unknown,
  ): Promise<{ status: number; body: T }> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'integration-curator',
        'x-user-role': 'curator',
      },
      body: JSON.stringify(payload),
    });

    return {
      status: response.status,
      body: (await response.json()) as T,
    };
  }

  async function deleteJson<T>(path: string): Promise<{ status: number; body: T }> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': 'integration-curator',
        'x-user-role': 'curator',
      },
    });

    return {
      status: response.status,
      body: (await response.json()) as T,
    };
  }

  async function deleteCapabilitiesByPrefix(prefix: string): Promise<void> {
    if (!prisma) {
      return;
    }

    // Phase 6A added CapabilityVersion with a non-cascade FK on capabilityId.
    // Delete version rows first to avoid FK constraint violations on cleanup.
    await prisma.capabilityVersion.deleteMany({
      where: {
        capability: {
          uniqueName: { startsWith: prefix },
        },
      },
    });

    while (true) {
      const { count } = await prisma.capability.deleteMany({
        where: {
          uniqueName: {
            startsWith: prefix,
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

    const remaining = await prisma.capability.findMany({
      where: {
        uniqueName: {
          startsWith: prefix,
        },
      },
      select: {
        uniqueName: true,
      },
    });

    if (remaining.length > 0) {
      throw new Error(
        `Unable to clean up integration test capabilities: ${remaining
          .map((capability) => capability.uniqueName)
          .join(', ')}`,
      );
    }
  }
});
