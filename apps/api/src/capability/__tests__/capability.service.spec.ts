import { Test, type TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CapabilityService } from '../capability.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CapabilityType, LifecycleStatus } from '../dto/create-capability.dto';
import { ActiveLifecycleMetadataIncompleteException } from '../exceptions/active-lifecycle-metadata-incomplete.exception';
import { NameGuardrailService } from '../name-guardrail.service';
import { CapabilityVersionService } from '../../versioning/capability-version.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

// mockPrismaService is also used as the tx client passed to $transaction callbacks
// so that existing assertions on prisma.capability.create/update/delete still work.
const mockPrismaService = {
  // Pass `this` mock as the tx client — keeps all existing assertions valid.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction: jest.fn().mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
    return fn(mockPrismaService);
  }),
  capability: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  capabilityVersion: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
  },
};

// CapabilityVersionService mock – recordChange and recordChangeDirect just resolve silently.
const mockCapabilityVersionService = {
  recordChange: jest.fn().mockResolvedValue(undefined),
  recordChangeDirect: jest.fn().mockResolvedValue(undefined),
  getHistory: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 25, totalPages: 0, capabilityId: '' }),
  ensureDraftVersionId: jest.fn().mockResolvedValue('draft-version-id'),
  computeChangedFields: jest.fn().mockReturnValue({}),
};

type CapabilityFindUniqueArgs = {
  where: {
    id?: string;
    uniqueName?: string;
  };
};

type CapabilityFindManyArgs = {
  where: {
    parentId: {
      in: string[];
    };
  };
};

const createCapabilityRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'capability-id',
  uniqueName: 'test-capability',
  aliases: [],
  description: null,
  domain: null,
  type: CapabilityType.ABSTRACT,
  parentId: null,
  lifecycleStatus: LifecycleStatus.DRAFT,
  effectiveFrom: null,
  effectiveTo: null,
  rationale: null,
  sourceReferences: [],
  tags: [],
  stewardId: null,
  stewardDepartment: null,
  nameGuardrailOverride: false,
  nameGuardrailOverrideRationale: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  branchOriginId: null,
  parent: null,
  children: [],
  ...overrides,
});

describe('CapabilityService', () => {
  let service: CapabilityService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapabilityService,
        NameGuardrailService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CapabilityVersionService, useValue: mockCapabilityVersionService },
      ],
    }).compile();

    service = module.get<CapabilityService>(CapabilityService);
    prisma = module.get(PrismaService);

    jest.resetAllMocks();

    // Re-apply $transaction mock after resetAllMocks clears implementations.
    // Pass mockPrismaService itself as the tx client so assertions on
    // prisma.capability.* still work (same object reference).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(mockPrismaService));
    // deleteMany must resolve for the delete $transaction path.
    mockPrismaService.capabilityVersion.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaService.capabilityVersion.count.mockResolvedValue(0);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated capabilities', async () => {
      const mockCapabilities = [
        { id: '1', uniqueName: 'cap-1', children: [] },
        { id: '2', uniqueName: 'cap-2', children: [] },
      ];
      prisma.capability.findMany.mockResolvedValue(mockCapabilities);
      prisma.capability.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 25 });

      expect(result.items).toEqual(mockCapabilities);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should apply search filter', async () => {
      prisma.capability.findMany.mockResolvedValue([]);
      prisma.capability.count.mockResolvedValue(0);

      await service.findAll({ search: 'payment' });

      expect(prisma.capability.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                uniqueName: { contains: 'payment', mode: 'insensitive' },
              }),
            ]),
          }),
        }),
      );
    });

    it('should trim the search filter before querying', async () => {
      prisma.capability.findMany.mockResolvedValue([]);
      prisma.capability.count.mockResolvedValue(0);

      await service.findAll({ search: '  payment  ' });

      expect(prisma.capability.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                uniqueName: { contains: 'payment', mode: 'insensitive' },
              }),
            ]),
          }),
        }),
      );
    });

    it('should fall back to default pagination when page and limit are invalid', async () => {
      prisma.capability.findMany.mockResolvedValue([]);
      prisma.capability.count.mockResolvedValue(0);

      const result = await service.findAll({ page: Number.NaN, limit: 0 });

      expect(prisma.capability.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 25,
        }),
      );
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
      expect(result.totalPages).toBe(0);
    });

    it('should always filter out branch-local capabilities (branchOriginId: null in WHERE)', async () => {
      prisma.capability.findMany.mockResolvedValue([]);
      prisma.capability.count.mockResolvedValue(0);

      await service.findAll({});

      // The WHERE clause must always include branchOriginId: null so that
      // capabilities created inside a what-if branch never appear in main reads.
      expect(prisma.capability.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchOriginId: null }),
        }),
      );
      expect(prisma.capability.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchOriginId: null }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a capability by id', async () => {
      const mockCapability = {
        id: 'test-uuid',
        uniqueName: 'test-cap',
        parent: null,
        children: [],
      };
      prisma.capability.findUnique.mockResolvedValue(mockCapability);

      const result = await service.findOne('test-uuid');

      expect(result).toEqual(mockCapability);
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.capability.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-uuid')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for a branch-local capability (branchOriginId set)', async () => {
      // A capability created inside a what-if branch has branchOriginId set.
      // It must be invisible through the main capability read API.
      const branchLocalCap = createCapabilityRecord({
        id: 'branch-cap-id',
        branchOriginId: 'some-branch-id',
        parent: null,
        children: [],
      });
      prisma.capability.findUnique.mockResolvedValue(branchLocalCap);

      await expect(service.findOne('branch-cap-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a capability', async () => {
      const dto = { uniqueName: 'new-capability' };
      const created = {
        ...createCapabilityRecord({
          id: 'new-uuid',
          uniqueName: 'new-capability',
        }),
      };
      prisma.capability.findUnique.mockResolvedValue(null);
      prisma.capability.create.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(result).toEqual(created);
      expect(prisma.capability.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          uniqueName: 'new-capability',
          nameGuardrailOverride: false,
          nameGuardrailOverrideRationale: null,
        }),
      });
    });

    it('should return a warning when the capability name matches the guardrail blocklist', async () => {
      const dto = { uniqueName: 'Salesforce CRM' };
      const created = createCapabilityRecord({
        id: 'guardrail-uuid',
        uniqueName: dto.uniqueName,
      });
      prisma.capability.findUnique.mockResolvedValue(null);
      prisma.capability.create.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(result.guardrailWarnings).toEqual([
        expect.objectContaining({
          code: 'CAPABILITY_NAME_GUARDRAIL',
          matchedTerms: ['salesforce'],
          overrideApplied: false,
          overrideRationale: null,
        }),
      ]);
    });

    it('should require rationale when overriding a flagged capability name', async () => {
      await expect(
        service.create({
          uniqueName: 'SAP platform',
          nameGuardrailOverride: true,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.capability.create).not.toHaveBeenCalled();
    });

    it('should persist override rationale when explicitly overriding a flagged capability name', async () => {
      const dto = {
        uniqueName: 'SAP platform',
        nameGuardrailOverride: true,
        nameGuardrailOverrideRationale: 'Stewardship-approved industry term',
      };
      const created = createCapabilityRecord({
        id: 'override-uuid',
        uniqueName: dto.uniqueName,
        nameGuardrailOverride: true,
        nameGuardrailOverrideRationale: dto.nameGuardrailOverrideRationale,
      });
      prisma.capability.findUnique.mockResolvedValue(null);
      prisma.capability.create.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(prisma.capability.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          nameGuardrailOverride: true,
          nameGuardrailOverrideRationale: 'Stewardship-approved industry term',
        }),
      });
      expect(result.guardrailWarnings).toEqual([
        expect.objectContaining({
          matchedTerms: ['sap'],
          overrideApplied: true,
          overrideRationale: 'Stewardship-approved industry term',
        }),
      ]);
    });

    it('should reject create when parent capability does not exist', async () => {
      prisma.capability.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ uniqueName: 'new-capability', parentId: 'missing-parent' }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.capability.create).not.toHaveBeenCalled();
    });

    it('should reject create when unique name already exists', async () => {
      prisma.capability.findUnique.mockImplementation(({ where }: CapabilityFindUniqueArgs) => {
        if ('uniqueName' in where) {
          return Promise.resolve({ id: 'existing-capability' });
        }

        return Promise.resolve(null);
      });

      await expect(service.create({ uniqueName: 'existing-capability' })).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.capability.create).not.toHaveBeenCalled();
    });

    it('should reject creating an active capability without the required metadata', async () => {
      await expect(
        service.create({
          uniqueName: 'active-capability',
          lifecycleStatus: LifecycleStatus.ACTIVE,
          description: '   ',
          domain: 'Finance',
          stewardId: 'steward-123',
        }),
      ).rejects.toThrow(ActiveLifecycleMetadataIncompleteException);

      expect(prisma.capability.findUnique).not.toHaveBeenCalled();
      expect(prisma.capability.create).not.toHaveBeenCalled();
    });

    it('should allow creating an active capability with complete mandatory metadata', async () => {
      const dto = {
        uniqueName: 'active-capability',
        lifecycleStatus: LifecycleStatus.ACTIVE,
        description: 'Supports payment processing',
        domain: 'Finance',
        stewardId: 'steward-123',
        stewardDepartment: 'Finance Architecture',
      };
      const created = createCapabilityRecord({
        id: 'active-uuid',
        ...dto,
      });

      prisma.capability.findUnique.mockResolvedValue(null);
      prisma.capability.create.mockResolvedValue(created);

      await expect(service.create(dto)).resolves.toEqual(created);
    });
  });

  describe('update', () => {
    it('should update an existing capability', async () => {
      const existing = createCapabilityRecord({
        id: 'uuid',
        uniqueName: 'old-name',
      });
      prisma.capability.findUnique.mockImplementation(({ where }: CapabilityFindUniqueArgs) => {
        if ('id' in where && where.id === 'uuid') {
          return Promise.resolve(existing);
        }

        if ('uniqueName' in where) {
          return Promise.resolve(null);
        }

        return Promise.resolve(null);
      });
      prisma.capability.update.mockResolvedValue({
        ...existing,
        uniqueName: 'new-name',
      });

      const result = await service.update('uuid', { uniqueName: 'new-name' });

      expect(result.uniqueName).toBe('new-name');
      expect(result.guardrailWarnings).toBeUndefined();
    });

    it('should allow update when unique name belongs to the same capability', async () => {
      const existing = createCapabilityRecord({
        id: 'uuid',
        uniqueName: 'same-name',
      });
      prisma.capability.findUnique.mockImplementation(({ where }: CapabilityFindUniqueArgs) => {
        if ('id' in where && where.id === 'uuid') {
          return Promise.resolve(existing);
        }

        if ('uniqueName' in where && where.uniqueName === 'same-name') {
          return Promise.resolve({ id: 'uuid' });
        }

        return Promise.resolve(null);
      });
      prisma.capability.update.mockResolvedValue(existing);

      await expect(service.update('uuid', { uniqueName: 'same-name' })).resolves.toMatchObject(
        existing,
      );
    });

    it('should allow transitioning to active when the existing capability already has the required metadata', async () => {
      const existing = createCapabilityRecord({
        id: 'uuid',
        uniqueName: 'draft-capability',
        description: 'Supports payment processing',
        domain: 'Finance',
        stewardId: 'steward-123',
        stewardDepartment: 'Finance Architecture',
      });
      prisma.capability.findUnique.mockImplementation(({ where }: CapabilityFindUniqueArgs) => {
        if ('id' in where && where.id === 'uuid') {
          return Promise.resolve(existing);
        }

        return Promise.resolve(null);
      });
      prisma.capability.update.mockResolvedValue({
        ...existing,
        lifecycleStatus: LifecycleStatus.ACTIVE,
      });

      await expect(
        service.update('uuid', { lifecycleStatus: LifecycleStatus.ACTIVE }),
      ).resolves.toMatchObject({
        id: 'uuid',
        lifecycleStatus: LifecycleStatus.ACTIVE,
      });
    });

    it('should reject update when parent capability does not exist', async () => {
      const existing = createCapabilityRecord({ id: 'uuid' });
      prisma.capability.findUnique.mockImplementation(({ where }: CapabilityFindUniqueArgs) => {
        if ('id' in where && where.id === 'uuid') {
          return Promise.resolve(existing);
        }

        return Promise.resolve(null);
      });

      await expect(service.update('uuid', { parentId: 'missing-parent' })).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.capability.update).not.toHaveBeenCalled();
    });

    it('should reject update when parent capability matches the capability id', async () => {
      const existing = createCapabilityRecord({ id: 'uuid' });
      prisma.capability.findUnique.mockResolvedValue(existing);

      await expect(service.update('uuid', { parentId: 'uuid' })).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.capability.update).not.toHaveBeenCalled();
    });

    it('should reject update when unique name already exists on another capability', async () => {
      const existing = createCapabilityRecord({
        id: 'uuid',
        uniqueName: 'current-name',
      });
      prisma.capability.findUnique.mockImplementation(({ where }: CapabilityFindUniqueArgs) => {
        if ('id' in where && where.id === 'uuid') {
          return Promise.resolve(existing);
        }

        if ('uniqueName' in where && where.uniqueName === 'duplicate-name') {
          return Promise.resolve({ id: 'another-capability' });
        }

        return Promise.resolve(null);
      });

      await expect(service.update('uuid', { uniqueName: 'duplicate-name' })).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.capability.update).not.toHaveBeenCalled();
    });

    it('should reject update when the new parent is a descendant capability', async () => {
      const existing = createCapabilityRecord({ id: 'root', uniqueName: 'Root' });
      prisma.capability.findUnique.mockImplementation(({ where }: CapabilityFindUniqueArgs) => {
        if ('id' in where && where.id === 'root') {
          return Promise.resolve(existing);
        }

        if ('id' in where && where.id === 'grandchild') {
          return Promise.resolve({ parentId: 'child-a' });
        }

        if ('id' in where && where.id === 'child-a') {
          return Promise.resolve({ parentId: 'root' });
        }

        return Promise.resolve(null);
      });

      await expect(service.update('root', { parentId: 'grandchild' })).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.capability.update).not.toHaveBeenCalled();
    });

    it('should reject transitioning to active when mandatory metadata would still be missing', async () => {
      const existing = createCapabilityRecord({
        id: 'uuid',
        uniqueName: 'draft-capability',
        description: 'Supports payment processing',
        stewardId: 'steward-123',
        stewardDepartment: 'Finance Architecture',
      });
      prisma.capability.findUnique.mockImplementation(({ where }: CapabilityFindUniqueArgs) => {
        if ('id' in where && where.id === 'uuid') {
          return Promise.resolve(existing);
        }

        return Promise.resolve(null);
      });

      await expect(service.update('uuid', { lifecycleStatus: LifecycleStatus.ACTIVE })).rejects.toThrow(
        ActiveLifecycleMetadataIncompleteException,
      );

      expect(prisma.capability.update).not.toHaveBeenCalled();
    });

    it('should preserve an existing override rationale when a flagged name remains unchanged', async () => {
      const existing = createCapabilityRecord({
        id: 'uuid',
        uniqueName: 'Oracle reporting',
        nameGuardrailOverride: true,
        nameGuardrailOverrideRationale: 'Stewardship-approved terminology',
      });
      prisma.capability.findUnique.mockImplementation(({ where }: CapabilityFindUniqueArgs) => {
        if ('id' in where && where.id === 'uuid') {
          return Promise.resolve(existing);
        }

        return Promise.resolve(null);
      });
      prisma.capability.update.mockResolvedValue(existing);

      const result = await service.update('uuid', { description: 'Updated description' });

      expect(prisma.capability.update).toHaveBeenCalledWith({
        where: { id: 'uuid' },
        data: expect.objectContaining({
          description: 'Updated description',
          nameGuardrailOverride: true,
          nameGuardrailOverrideRationale: 'Stewardship-approved terminology',
        }),
      });
      expect(result.guardrailWarnings).toEqual([
        expect.objectContaining({
          matchedTerms: ['oracle'],
          overrideApplied: true,
          overrideRationale: 'Stewardship-approved terminology',
        }),
      ]);
    });

    it('should clear stored override fields when the updated name is no longer flagged', async () => {
      const existing = createCapabilityRecord({
        id: 'uuid',
        uniqueName: 'Salesforce support',
        nameGuardrailOverride: true,
        nameGuardrailOverrideRationale: 'Historical exception',
      });
      prisma.capability.findUnique.mockImplementation(({ where }: CapabilityFindUniqueArgs) => {
        if ('id' in where && where.id === 'uuid') {
          return Promise.resolve(existing);
        }

        if ('uniqueName' in where) {
          return Promise.resolve(null);
        }

        return Promise.resolve(null);
      });
      prisma.capability.update.mockResolvedValue(
        createCapabilityRecord({
          id: 'uuid',
          uniqueName: 'Customer relationship management',
        }),
      );

      const result = await service.update('uuid', {
        uniqueName: 'Customer relationship management',
      });

      expect(prisma.capability.update).toHaveBeenCalledWith({
        where: { id: 'uuid' },
        data: expect.objectContaining({
          uniqueName: 'Customer relationship management',
          nameGuardrailOverride: false,
          nameGuardrailOverrideRationale: null,
        }),
      });
      expect(result.guardrailWarnings).toBeUndefined();
    });
  });

  describe('getChildren', () => {
    it('should return children of a capability', async () => {
      const parent = { id: 'parent-uuid', uniqueName: 'parent', parent: null, children: [] };
      const children = [{ id: 'child-1', uniqueName: 'child-1', parentId: 'parent-uuid' }];
      prisma.capability.findUnique.mockResolvedValue(parent);
      prisma.capability.findMany.mockResolvedValue(children);

      const result = await service.getChildren('parent-uuid');

      expect(result).toEqual(children);
    });
  });

  describe('getBreadcrumbs', () => {
    it('should return breadcrumb trail', async () => {
      prisma.capability.findUnique
        .mockResolvedValueOnce({ id: 'child', uniqueName: 'Child', parentId: 'parent' })
        .mockResolvedValueOnce({ id: 'parent', uniqueName: 'Parent', parentId: null });

      const result = await service.getBreadcrumbs('child');

      expect(result).toEqual([
        { id: 'parent', uniqueName: 'Parent' },
        { id: 'child', uniqueName: 'Child' },
      ]);
    });
  });

  describe('getSubtree', () => {
    it('should return the full nested subtree for a capability', async () => {
      const root = createCapabilityRecord({ id: 'root', uniqueName: 'Root' });
      const childA = createCapabilityRecord({
        id: 'child-a',
        uniqueName: 'Child A',
        parentId: 'root',
      });
      const childB = createCapabilityRecord({
        id: 'child-b',
        uniqueName: 'Child B',
        parentId: 'root',
      });
      const grandchild = createCapabilityRecord({
        id: 'grandchild',
        uniqueName: 'Grandchild',
        parentId: 'child-a',
      });

      prisma.capability.findUnique.mockImplementation(({ where }: CapabilityFindUniqueArgs) => {
        if ('id' in where && where.id === 'root') {
          return Promise.resolve(root);
        }

        return Promise.resolve(null);
      });
      prisma.capability.findMany.mockImplementation(({ where }: CapabilityFindManyArgs) => {
        const parentIds = where.parentId.in as string[];

        return Promise.resolve(
          [childA, childB, grandchild].filter(
            (capability) => capability.parentId !== null && parentIds.includes(capability.parentId),
          ),
        );
      });

      const result = await service.getSubtree('root');

      expect(result).toEqual({
        ...root,
        children: [
          {
            ...childA,
            children: [{ ...grandchild, children: [] }],
          },
          {
            ...childB,
            children: [],
          },
        ],
      });
    });
  });

  describe('getLeaves', () => {
    it('should return only leaf capabilities within a subtree', async () => {
      const root = createCapabilityRecord({ id: 'root', uniqueName: 'Root' });
      const childA = createCapabilityRecord({
        id: 'child-a',
        uniqueName: 'Child A',
        parentId: 'root',
      });
      const childB = createCapabilityRecord({
        id: 'child-b',
        uniqueName: 'Child B',
        parentId: 'root',
      });
      const grandchild = createCapabilityRecord({
        id: 'grandchild',
        uniqueName: 'Grandchild',
        parentId: 'child-a',
      });

      prisma.capability.findUnique.mockImplementation(({ where }: CapabilityFindUniqueArgs) => {
        if ('id' in where && where.id === 'root') {
          return Promise.resolve(root);
        }

        return Promise.resolve(null);
      });
      prisma.capability.findMany.mockImplementation(({ where }: CapabilityFindManyArgs) => {
        const parentIds = where.parentId.in as string[];

        return Promise.resolve(
          [childA, childB, grandchild].filter(
            (capability) => capability.parentId !== null && parentIds.includes(capability.parentId),
          ),
        );
      });

      const result = await service.getLeaves('root');

      expect(result).toEqual([childB, grandchild]);
    });
  });

  describe('getStewardship', () => {
    it('should return direct stewardship when the capability has a direct steward assignment', async () => {
      prisma.capability.findUnique.mockResolvedValue(
        createCapabilityRecord({
          id: 'capability-id',
          stewardId: 'steward-direct',
          stewardDepartment: 'Direct Department',
        }),
      );

      await expect(service.getStewardship('capability-id')).resolves.toEqual({
        capabilityId: 'capability-id',
        stewardId: 'steward-direct',
        stewardDepartment: 'Direct Department',
        source: 'DIRECT',
        sourceCapabilityId: 'capability-id',
      });
    });

    it('should return inherited stewardship from the nearest assigned ancestor', async () => {
      prisma.capability.findUnique
        .mockResolvedValueOnce(
          createCapabilityRecord({
            id: 'child-id',
            parentId: 'parent-id',
          }),
        )
        .mockResolvedValueOnce(
          createCapabilityRecord({
            id: 'parent-id',
            stewardId: 'steward-parent',
            stewardDepartment: 'Parent Department',
          }),
        );

      await expect(service.getStewardship('child-id')).resolves.toEqual({
        capabilityId: 'child-id',
        stewardId: 'steward-parent',
        stewardDepartment: 'Parent Department',
        source: 'INHERITED',
        sourceCapabilityId: 'parent-id',
      });
    });

    it('should allow a child subtree assignment to override inherited stewardship', async () => {
      prisma.capability.findUnique
        .mockResolvedValueOnce(
          createCapabilityRecord({
            id: 'grandchild-id',
            parentId: 'child-id',
          }),
        )
        .mockResolvedValueOnce(
          createCapabilityRecord({
            id: 'child-id',
            parentId: 'root-id',
            stewardId: 'steward-child',
            stewardDepartment: 'Child Department',
          }),
        );

      await expect(service.getStewardship('grandchild-id')).resolves.toEqual({
        capabilityId: 'grandchild-id',
        stewardId: 'steward-child',
        stewardDepartment: 'Child Department',
        source: 'INHERITED',
        sourceCapabilityId: 'child-id',
      });
    });

    it('should return unassigned when no capability in the lineage has a complete direct assignment', async () => {
      prisma.capability.findUnique
        .mockResolvedValueOnce(
          createCapabilityRecord({
            id: 'child-id',
            parentId: 'parent-id',
          }),
        )
        .mockResolvedValueOnce(
          createCapabilityRecord({
            id: 'parent-id',
            parentId: 'root-id',
            stewardId: 'steward-parent',
          }),
        )
        .mockResolvedValueOnce(
          createCapabilityRecord({
            id: 'root-id',
            parentId: null,
          }),
        );

      await expect(service.getStewardship('child-id')).resolves.toEqual({
        capabilityId: 'child-id',
        stewardId: null,
        stewardDepartment: null,
        source: 'UNASSIGNED',
        sourceCapabilityId: null,
      });
    });

    it('should throw NotFoundException when the capability does not exist', async () => {
      prisma.capability.findUnique.mockResolvedValue(null);

      await expect(service.getStewardship('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException when the hierarchy contains a cycle', async () => {
      prisma.capability.findUnique
        .mockResolvedValueOnce(
          createCapabilityRecord({
            id: 'child-id',
            parentId: 'parent-id',
          }),
        )
        .mockResolvedValueOnce(
          createCapabilityRecord({
            id: 'parent-id',
            parentId: 'child-id',
          }),
        );

      await expect(service.getStewardship('child-id')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('delete', () => {
    it('should delete a draft capability with no children', async () => {
      prisma.capability.findUnique.mockResolvedValue(
        createCapabilityRecord({
          id: 'uuid',
          lifecycleStatus: LifecycleStatus.DRAFT,
          children: [],
        }),
      );
      prisma.capability.delete.mockResolvedValue(undefined);

      await expect(service.delete('uuid')).resolves.toBeUndefined();

      expect(prisma.capability.delete).toHaveBeenCalledWith({
        where: { id: 'uuid' },
      });
    });

    it('should reject delete when the capability is not draft', async () => {
      prisma.capability.findUnique.mockResolvedValue(
        createCapabilityRecord({
          id: 'uuid',
          lifecycleStatus: LifecycleStatus.ACTIVE,
        }),
      );

      await expect(service.delete('uuid')).rejects.toThrow(BadRequestException);

      expect(prisma.capability.delete).not.toHaveBeenCalled();
    });

    it('should reject delete when the capability has children', async () => {
      prisma.capability.findUnique.mockResolvedValue(
        createCapabilityRecord({
          id: 'uuid',
          children: [{ id: 'child-1', uniqueName: 'Child', type: CapabilityType.LEAF }],
        }),
      );

      await expect(service.delete('uuid')).rejects.toThrow(BadRequestException);

      expect(prisma.capability.delete).not.toHaveBeenCalled();
    });
  });

  describe('guardrail review queue', () => {
    let nameGuardrailService: NameGuardrailService;

    beforeEach(() => {
      nameGuardrailService = new NameGuardrailService(prisma as unknown as PrismaService);
    });

    it('should return flagged capabilities for review with override state', async () => {
      prisma.capability.findMany.mockResolvedValue([
        createCapabilityRecord({
          id: 'flagged',
          uniqueName: 'Slack workflow coordination',
          domain: 'Collaboration',
          stewardId: 'steward-1',
          stewardDepartment: 'EA',
          nameGuardrailOverride: true,
          nameGuardrailOverrideRationale: 'Stewardship-approved shared term',
        }),
        createCapabilityRecord({
          id: 'clean',
          uniqueName: 'Workflow coordination',
        }),
      ]);

      await expect(nameGuardrailService.findFlaggedCapabilities()).resolves.toEqual({
        items: [
          expect.objectContaining({
            id: 'flagged',
            uniqueName: 'Slack workflow coordination',
            matchedTerms: ['slack'],
            nameGuardrailOverride: true,
            nameGuardrailOverrideRationale: 'Stewardship-approved shared term',
          }),
        ],
        page: 1,
        limit: 25,
        hasMore: false,
      });
    });

    it('should detect camel-case product names in concatenated capability names', () => {
      expect(nameGuardrailService.evaluateName('SalesforceCRM').matchedTerms).toEqual(['salesforce']);
    });
  });
});
