import { Test, type TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchType,
  CapabilityVersionChangeType,
  ModelVersionState,
} from '@prisma/client';
import { ModelVersionService } from '../model-version.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CapabilityVersionService } from '../capability-version.service';
import { AuditService } from '../../audit/audit.service';
import { DomainEventBus } from '../../structural-ops/events/capability-domain-events';
import { PublishEventService } from '../../integration/publish-event.service';

const mockPrismaService = {
  // Pass `this` mock as the tx client so assertions can target the same object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction: jest.fn().mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
    return fn(mockPrismaService);
  }),
  capability: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  capabilityVersion: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  modelVersion: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockCapabilityVersionService = {
  computeChangedFields: jest.fn().mockReturnValue({}),
};

const mockAuditService = {
  record: jest.fn().mockResolvedValue(undefined),
};

const mockTransactionalPublishEventRecorder = {
  recordModelVersionEvent: jest.fn().mockResolvedValue(undefined),
};

const mockPublishEventService = {
  forClient: jest.fn().mockReturnValue(mockTransactionalPublishEventRecorder),
};

const mockDomainEventBus = {
  emitModelVersionPublished: jest.fn(),
  emitModelVersionRolledBack: jest.fn(),
};

const createModelVersionRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'model-version-id',
  versionLabel: 'draft-1000',
  state: ModelVersionState.DRAFT,
  baseVersionId: null,
  branchType: BranchType.MAIN,
  branchName: null,
  description: null,
  notes: null,
  createdBy: 'steward-1',
  approvedBy: null,
  publishedAt: null,
  rollbackOfVersionId: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const createCapabilityRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'capability-id',
  uniqueName: 'Current Capability',
  aliases: [],
  description: 'Current description',
  domain: null,
  type: 'LEAF',
  parentId: null,
  lifecycleStatus: 'DRAFT',
  effectiveFrom: null,
  effectiveTo: null,
  rationale: null,
  sourceReferences: [],
  tags: [],
  stewardId: null,
  stewardDepartment: null,
  nameGuardrailOverride: false,
  nameGuardrailOverrideRationale: null,
  isErroneous: false,
  erroneousReason: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  branchOriginId: null,
  ...overrides,
});

describe('ModelVersionService', () => {
  let service: ModelVersionService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelVersionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CapabilityVersionService, useValue: mockCapabilityVersionService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: PublishEventService, useValue: mockPublishEventService },
        { provide: DomainEventBus, useValue: mockDomainEventBus },
      ],
    }).compile();

    service = module.get<ModelVersionService>(ModelVersionService);
    prisma = module.get(PrismaService);

    jest.resetAllMocks();

    // Re-apply $transaction and dependency defaults after resetAllMocks clears implementations.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(mockPrismaService));
    mockCapabilityVersionService.computeChangedFields.mockReturnValue({});
    mockPublishEventService.forClient.mockReturnValue(mockTransactionalPublishEventRecorder);
    mockTransactionalPublishEventRecorder.recordModelVersionEvent.mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listVersions', () => {
    it('should return versions ordered by createdAt descending', async () => {
      const items = [
        createModelVersionRecord({
          id: 'version-2',
          versionLabel: 'v2.0.0',
          state: ModelVersionState.PUBLISHED,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
        createModelVersionRecord({
          id: 'version-1',
          versionLabel: 'v1.0.0',
          state: ModelVersionState.ROLLED_BACK,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ];
      prisma.modelVersion.findMany.mockResolvedValue(items);

      const result = await service.listVersions();

      expect(prisma.modelVersion.findMany).toHaveBeenCalledWith({
        where: { branchType: BranchType.MAIN },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual({ items, total: 2 });
    });
  });

  describe('findById', () => {
    it('should return a model version by id', async () => {
      const version = createModelVersionRecord({
        id: 'version-id',
        versionLabel: 'v1.0.0',
        state: ModelVersionState.PUBLISHED,
      });
      prisma.modelVersion.findUnique.mockResolvedValue(version);

      const result = await service.findById('version-id');

      expect(prisma.modelVersion.findUnique).toHaveBeenCalledWith({
        where: { id: 'version-id' },
      });
      expect(result).toEqual(version);
    });

    it('should throw NotFoundException when the version does not exist', async () => {
      prisma.modelVersion.findUnique.mockResolvedValue(null);

      await expect(service.findById('missing-version-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getOrCreateDraft', () => {
    it('should return the current draft when one already exists', async () => {
      const existingDraft = createModelVersionRecord({ id: 'existing-draft-id' });
      jest.spyOn(service, 'getCurrentDraft').mockResolvedValue(existingDraft);

      const result = await service.getOrCreateDraft('steward-1');

      expect(result).toEqual(existingDraft);
      expect(prisma.modelVersion.create).not.toHaveBeenCalled();
    });

    it('should create a new draft when none exists', async () => {
      const createdDraft = createModelVersionRecord({ id: 'new-draft-id' });
      jest.spyOn(service, 'getCurrentDraft').mockResolvedValue(null);
      prisma.modelVersion.create.mockResolvedValue(createdDraft);

      const result = await service.getOrCreateDraft('steward-1');

      expect(prisma.modelVersion.create).toHaveBeenCalledWith({
        data: {
          versionLabel: expect.stringMatching(/^draft-\d+$/),
          state: ModelVersionState.DRAFT,
          branchType: BranchType.MAIN,
          createdBy: 'steward-1',
        },
      });
      expect(result).toEqual(createdDraft);
    });
  });

  describe('publishSnapshot', () => {
    it('should throw BadRequestException when no active draft exists', async () => {
      prisma.modelVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.publishSnapshot({
          versionLabel: 'v1.0.0',
          actorId: 'steward-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should publish the current draft, roll back the previous published version, and create a new draft', async () => {
      const draft = createModelVersionRecord({
        id: 'draft-version-id',
        versionLabel: 'draft-1000',
        state: ModelVersionState.DRAFT,
      });
      const publishedVersion = createModelVersionRecord({
        id: 'draft-version-id',
        versionLabel: 'v2.0.0',
        state: ModelVersionState.PUBLISHED,
        description: 'Approved release',
        notes: 'Publish notes',
        approvedBy: 'approver-1',
        publishedAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      const newDraftVersion = createModelVersionRecord({
        id: 'new-draft-id',
        versionLabel: 'draft-2000',
        state: ModelVersionState.DRAFT,
        baseVersionId: 'draft-version-id',
      });
      prisma.modelVersion.findFirst.mockResolvedValue(draft);
      const findByIdSpy = jest
        .spyOn(service, 'findById')
        .mockResolvedValueOnce(publishedVersion)
        .mockResolvedValueOnce(newDraftVersion);
      prisma.modelVersion.findUnique.mockResolvedValue(null);
      prisma.modelVersion.updateMany.mockResolvedValue({ count: 1 });
      prisma.modelVersion.update.mockResolvedValue(publishedVersion);
      prisma.modelVersion.create.mockResolvedValue({ id: 'new-draft-id' });

      const result = await service.publishSnapshot({
        versionLabel: 'v2.0.0',
        description: 'Approved release',
        notes: 'Publish notes',
        approvedBy: 'approver-1',
        actorId: 'steward-2',
      });

      expect(prisma.modelVersion.updateMany).toHaveBeenCalledWith({
        where: {
          state: ModelVersionState.PUBLISHED,
          branchType: BranchType.MAIN,
        },
        data: { state: ModelVersionState.ROLLED_BACK },
      });
      expect(prisma.modelVersion.update).toHaveBeenCalledWith({
        where: { id: 'draft-version-id' },
        data: {
          state: ModelVersionState.PUBLISHED,
          versionLabel: 'v2.0.0',
          description: 'Approved release',
          notes: 'Publish notes',
          approvedBy: 'approver-1',
          publishedAt: expect.any(Date),
        },
      });
      expect(prisma.modelVersion.create).toHaveBeenCalledWith({
        data: {
          versionLabel: expect.stringMatching(/^draft-\d+$/),
          state: ModelVersionState.DRAFT,
          branchType: BranchType.MAIN,
          createdBy: 'steward-2',
          baseVersionId: 'draft-version-id',
        },
        select: { id: true },
      });
      expect(prisma.modelVersion.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.modelVersion.update.mock.invocationCallOrder[0],
      );
      expect(prisma.modelVersion.update.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.modelVersion.create.mock.invocationCallOrder[0],
      );
      expect(findByIdSpy).toHaveBeenNthCalledWith(1, 'draft-version-id');
      expect(findByIdSpy).toHaveBeenNthCalledWith(2, 'new-draft-id');
      expect(mockPublishEventService.forClient).toHaveBeenCalledWith(mockPrismaService);
      expect(
        mockTransactionalPublishEventRecorder.recordModelVersionEvent,
      ).toHaveBeenCalledWith({
        eventType: 'model-version.published',
        modelVersionId: 'draft-version-id',
        entityId: 'draft-version-id',
        payloadRef: 'model-version/draft-version-id',
      });
      expect(mockDomainEventBus.emitModelVersionPublished).toHaveBeenCalledWith({
        modelVersionId: 'draft-version-id',
        versionLabel: 'v2.0.0',
        actorId: 'steward-2',
        newDraftId: 'new-draft-id',
        occurredAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      expect(result).toEqual({
        published: publishedVersion,
        newDraft: newDraftVersion,
      });
    });
  });

  describe('rollback', () => {
    it('should throw NotFoundException when the rollback target does not exist', async () => {
      prisma.modelVersion.findUnique.mockResolvedValue(null);

      await expect(
        service.rollback({
          rollbackOfVersionId: 'missing-version-id',
          createdBy: 'steward-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when an active draft already exists', async () => {
      const targetVersion = createModelVersionRecord({
        id: 'published-version-id',
        versionLabel: 'v1.0.0',
        state: ModelVersionState.PUBLISHED,
      });
      const existingDraft = createModelVersionRecord({
        id: 'active-draft-id',
        state: ModelVersionState.DRAFT,
      });
      jest.spyOn(service, 'findById').mockResolvedValue(targetVersion);
      jest.spyOn(service, 'getCurrentDraft').mockResolvedValue(existingDraft);

      await expect(
        service.rollback({
          rollbackOfVersionId: 'published-version-id',
          createdBy: 'steward-1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create a rollback draft, update changed capabilities, and record capability versions', async () => {
      const targetVersion = createModelVersionRecord({
        id: 'published-version-id',
        versionLabel: 'v1.0.0',
        state: ModelVersionState.PUBLISHED,
      });
      const rollbackDraft = createModelVersionRecord({
        id: 'rollback-draft-id',
        versionLabel: 'rollback-draft-2000',
        state: ModelVersionState.DRAFT,
        notes: 'Rollback notes',
        baseVersionId: 'published-version-id',
        rollbackOfVersionId: 'published-version-id',
      });
      const currentCapability = createCapabilityRecord({
        id: 'capability-id',
        uniqueName: 'Current Capability',
        description: 'Current description',
      });
      const updatedCapability = createCapabilityRecord({
        id: 'capability-id',
        uniqueName: 'Target Capability',
        description: 'Target description',
      });
      const changedFields = {
        uniqueName: {
          before: 'Current Capability',
          after: 'Target Capability',
        },
        description: {
          before: 'Current description',
          after: 'Target description',
        },
      };
      jest
        .spyOn(service, 'findById')
        .mockResolvedValueOnce(targetVersion)
        .mockResolvedValueOnce(rollbackDraft);
      jest.spyOn(service, 'getCurrentDraft').mockResolvedValue(null);
      jest
        .spyOn(
          service as unknown as {
            buildCapabilityStateAtVersion: (
              versionId: string,
            ) => Promise<Array<{ capabilityId: string; targetSnapshot: unknown }>>;
          },
          'buildCapabilityStateAtVersion',
        )
        .mockResolvedValue([
          {
            capabilityId: 'capability-id',
            targetSnapshot: {
              uniqueName: 'Target Capability',
              description: 'Target description',
            },
          },
        ]);
      mockCapabilityVersionService.computeChangedFields.mockReturnValue(changedFields);
      prisma.modelVersion.create.mockResolvedValue({ id: 'rollback-draft-id' });
      prisma.capability.findUnique
        .mockResolvedValueOnce(currentCapability)
        .mockResolvedValueOnce(updatedCapability);
      prisma.capability.update.mockResolvedValue(updatedCapability);
      prisma.capabilityVersion.findFirst.mockResolvedValue({ id: 'previous-version-id' });

      const result = await service.rollback({
        rollbackOfVersionId: 'published-version-id',
        createdBy: 'steward-1',
        notes: 'Rollback notes',
      });

      expect(prisma.modelVersion.create).toHaveBeenCalledWith({
        data: {
          versionLabel: expect.stringMatching(/^rollback-draft-\d+$/),
          state: ModelVersionState.DRAFT,
          branchType: BranchType.MAIN,
          createdBy: 'steward-1',
          notes: 'Rollback notes',
          rollbackOfVersionId: 'published-version-id',
          baseVersionId: 'published-version-id',
        },
        select: { id: true },
      });
      expect(prisma.capability.update).toHaveBeenCalledWith({
        where: { id: 'capability-id' },
        data: {
          uniqueName: 'Target Capability',
          description: 'Target description',
        },
      });
      expect(prisma.capabilityVersion.create).toHaveBeenCalledWith({
        data: {
          capabilityId: 'capability-id',
          modelVersionId: 'rollback-draft-id',
          changeType: CapabilityVersionChangeType.UPDATE,
          changedFields,
          beforeSnapshot: expect.objectContaining({
            uniqueName: 'Current Capability',
            description: 'Current description',
          }),
          afterSnapshot: expect.objectContaining({
            uniqueName: 'Target Capability',
            description: 'Target description',
          }),
          changedBy: 'steward-1',
          previousVersionId: 'previous-version-id',
        },
      });
      expect(mockPublishEventService.forClient).toHaveBeenCalledWith(mockPrismaService);
      expect(
        mockTransactionalPublishEventRecorder.recordModelVersionEvent,
      ).toHaveBeenCalledWith({
        eventType: 'model-version.rolled-back',
        modelVersionId: 'rollback-draft-id',
        entityId: 'rollback-draft-id',
        payloadRef: 'rollback/published-version-id',
      });
      expect(mockDomainEventBus.emitModelVersionRolledBack).toHaveBeenCalledWith({
        modelVersionId: 'rollback-draft-id',
        rollbackOfVersionId: 'published-version-id',
        actorId: 'steward-1',
        occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      expect(result).toEqual(rollbackDraft);
    });
  });

  describe('computeDiff', () => {
    it('should throw NotFoundException when one of the compared versions does not exist', async () => {
      prisma.modelVersion.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createModelVersionRecord({ id: 'to-version-id' }));

      await expect(service.computeDiff('missing-version-id', 'to-version-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return an empty diff when no capability changes exist in the range', async () => {
      const fromVersion = createModelVersionRecord({
        id: 'from-version-id',
        versionLabel: 'v1.0.0',
        state: ModelVersionState.PUBLISHED,
      });
      const toVersion = createModelVersionRecord({
        id: 'to-version-id',
        versionLabel: 'v2.0.0',
        state: ModelVersionState.PUBLISHED,
      });
      jest
        .spyOn(service, 'findById')
        .mockResolvedValueOnce(fromVersion)
        .mockResolvedValueOnce(toVersion);
      jest
        .spyOn(
          service as unknown as {
            getVersionLineageRange: (fromId: string, toId: string) => Promise<string[]>;
          },
          'getVersionLineageRange',
        )
        .mockResolvedValue(['from-version-id', 'to-version-id']);
      prisma.capabilityVersion.findMany.mockResolvedValue([]);

      const result = await service.computeDiff('from-version-id', 'to-version-id');

      expect(prisma.capabilityVersion.findMany).toHaveBeenCalledWith({
        where: {
          modelVersionId: { in: ['to-version-id'] },
        },
        orderBy: { changedAt: 'asc' },
        include: {
          capability: {
            select: {
              id: true,
              uniqueName: true,
            },
          },
        },
      });
      expect(result).toEqual({
        fromVersion: {
          id: 'from-version-id',
          versionLabel: 'v1.0.0',
          state: ModelVersionState.PUBLISHED,
        },
        toVersion: {
          id: 'to-version-id',
          versionLabel: 'v2.0.0',
          state: ModelVersionState.PUBLISHED,
        },
        added: [],
        modified: [],
        removed: [],
        summary: {
          addedCount: 0,
          modifiedCount: 0,
          removedCount: 0,
        },
      });
    });

    it('should classify added, removed, and modified capabilities from the change range', async () => {
      const fromVersion = createModelVersionRecord({
        id: 'from-version-id',
        versionLabel: 'v1.0.0',
        state: ModelVersionState.PUBLISHED,
      });
      const toVersion = createModelVersionRecord({
        id: 'to-version-id',
        versionLabel: 'v2.0.0',
        state: ModelVersionState.PUBLISHED,
      });
      jest
        .spyOn(service, 'findById')
        .mockResolvedValueOnce(fromVersion)
        .mockResolvedValueOnce(toVersion);
      jest
        .spyOn(
          service as unknown as {
            getVersionLineageRange: (fromId: string, toId: string) => Promise<string[]>;
          },
          'getVersionLineageRange',
        )
        .mockResolvedValue(['from-version-id', 'mid-version-id', 'to-version-id']);
      prisma.capabilityVersion.findMany.mockResolvedValue([
        {
          capabilityId: 'added-capability-id',
          changeType: CapabilityVersionChangeType.CREATE,
          changedFields: {
            uniqueName: { before: null, after: 'Added Capability' },
          },
          beforeSnapshot: null,
          afterSnapshot: { uniqueName: 'Added Capability' },
          capability: {
            id: 'added-capability-id',
            uniqueName: 'Added Capability',
          },
        },
        {
          capabilityId: 'added-capability-id',
          changeType: CapabilityVersionChangeType.UPDATE,
          changedFields: {
            description: { before: null, after: 'Added capability description' },
          },
          beforeSnapshot: { uniqueName: 'Added Capability' },
          afterSnapshot: {
            uniqueName: 'Added Capability',
            description: 'Added capability description',
          },
          capability: {
            id: 'added-capability-id',
            uniqueName: 'Added Capability',
          },
        },
        {
          capabilityId: 'removed-capability-id',
          changeType: CapabilityVersionChangeType.UPDATE,
          changedFields: {
            description: {
              before: 'Old description',
              after: 'Current description',
            },
          },
          beforeSnapshot: {
            uniqueName: 'Removed Capability',
            description: 'Old description',
          },
          afterSnapshot: {
            uniqueName: 'Removed Capability',
            description: 'Current description',
          },
          capability: {
            id: 'removed-capability-id',
            uniqueName: 'Removed Capability',
          },
        },
        {
          capabilityId: 'removed-capability-id',
          changeType: CapabilityVersionChangeType.DELETE,
          changedFields: {
            uniqueName: { before: 'Removed Capability', after: null },
          },
          beforeSnapshot: {
            uniqueName: 'Removed Capability',
            description: 'Current description',
          },
          afterSnapshot: null,
          capability: {
            id: 'removed-capability-id',
            uniqueName: 'Removed Capability',
          },
        },
        {
          capabilityId: 'modified-capability-id',
          changeType: CapabilityVersionChangeType.UPDATE,
          changedFields: {
            description: {
              before: 'Old description',
              after: 'New description',
            },
          },
          beforeSnapshot: { uniqueName: 'Modified Capability' },
          afterSnapshot: { uniqueName: 'Modified Capability' },
          capability: {
            id: 'modified-capability-id',
            uniqueName: 'Modified Capability',
          },
        },
        {
          capabilityId: 'modified-capability-id',
          changeType: CapabilityVersionChangeType.UPDATE,
          changedFields: {
            tags: {
              before: ['legacy'],
              after: ['strategic'],
            },
          },
          beforeSnapshot: { uniqueName: 'Modified Capability' },
          afterSnapshot: { uniqueName: 'Modified Capability' },
          capability: {
            id: 'modified-capability-id',
            uniqueName: 'Modified Capability',
          },
        },
      ]);

      const result = await service.computeDiff('from-version-id', 'to-version-id');

      expect(result).toEqual({
        fromVersion: {
          id: 'from-version-id',
          versionLabel: 'v1.0.0',
          state: ModelVersionState.PUBLISHED,
        },
        toVersion: {
          id: 'to-version-id',
          versionLabel: 'v2.0.0',
          state: ModelVersionState.PUBLISHED,
        },
        added: [
          {
            capabilityId: 'added-capability-id',
            name: 'Added Capability',
            afterSnapshot: {
              uniqueName: 'Added Capability',
              description: 'Added capability description',
            },
          },
        ],
        modified: [
          {
            capabilityId: 'modified-capability-id',
            name: 'Modified Capability',
            changedFields: {
              description: {
                before: 'Old description',
                after: 'New description',
              },
              tags: {
                before: ['legacy'],
                after: ['strategic'],
              },
            },
          },
        ],
        removed: [
          {
            capabilityId: 'removed-capability-id',
            name: 'Removed Capability',
            beforeSnapshot: {
              uniqueName: 'Removed Capability',
              description: 'Current description',
            },
          },
        ],
        summary: {
          addedCount: 1,
          modifiedCount: 1,
          removedCount: 1,
        },
      });
    });
  });
});
