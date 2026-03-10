import { Test, type TestingModule } from '@nestjs/testing';
import {
  BranchType,
  CapabilityVersionChangeType,
  ModelVersionState,
  Prisma,
} from '@prisma/client';
import {
  CapabilityVersionService,
  type RecordChangeParams,
} from '../capability-version.service';
import { PrismaService } from '../../prisma/prisma.service';

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
    count: jest.fn(),
    create: jest.fn(),
  },
  modelVersion: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

const createHistoryItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'capability-version-id',
  capabilityId: 'capability-id',
  modelVersionId: 'model-version-id',
  changeType: CapabilityVersionChangeType.UPDATE,
  changedFields: {
    uniqueName: { before: 'Old Name', after: 'New Name' },
  },
  beforeSnapshot: { uniqueName: 'Old Name' },
  afterSnapshot: { uniqueName: 'New Name' },
  changedBy: 'steward-1',
  changedAt: new Date('2026-01-01T00:00:00.000Z'),
  previousVersionId: null,
  modelVersion: {
    id: 'model-version-id',
    versionLabel: 'v1.0.0',
    state: ModelVersionState.PUBLISHED,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  ...overrides,
});

describe('CapabilityVersionService', () => {
  let service: CapabilityVersionService;
  let prisma: typeof mockPrismaService;
  let tx: Prisma.TransactionClient;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CapabilityVersionService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<CapabilityVersionService>(CapabilityVersionService);
    prisma = module.get(PrismaService);
    tx = prisma as unknown as Prisma.TransactionClient;

    jest.resetAllMocks();

    // Re-apply $transaction mock after resetAllMocks clears implementations.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.$transaction.mockImplementation(async (fn: (client: any) => Promise<unknown>) => fn(mockPrismaService));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('computeChangedFields', () => {
    it('should return all fields for CREATE snapshots', () => {
      const result = service.computeChangedFields(null, {
        uniqueName: 'Payments',
        tags: ['critical'],
      });

      expect(result).toEqual({
        uniqueName: { before: null, after: 'Payments' },
        tags: { before: null, after: ['critical'] },
      });
    });

    it('should return all fields for DELETE snapshots', () => {
      const result = service.computeChangedFields(
        {
          uniqueName: 'Payments',
          lifecycleStatus: 'ACTIVE',
        },
        null,
      );

      expect(result).toEqual({
        uniqueName: { before: 'Payments', after: null },
        lifecycleStatus: { before: 'ACTIVE', after: null },
      });
    });

    it('should return only changed fields for UPDATE snapshots', () => {
      const result = service.computeChangedFields(
        {
          uniqueName: 'Payments',
          stewardId: null,
          tags: ['shared'],
        },
        {
          uniqueName: 'Payments & Collections',
          stewardId: 'steward-1',
          tags: ['shared'],
        },
      );

      expect(result).toEqual({
        uniqueName: {
          before: 'Payments',
          after: 'Payments & Collections',
        },
        stewardId: {
          before: null,
          after: 'steward-1',
        },
      });
    });

    it('should return an empty object when snapshots do not change', () => {
      const snapshot = {
        uniqueName: 'Payments',
        tags: ['shared'],
        metadata: { domain: 'Finance' },
      };

      expect(service.computeChangedFields(snapshot, snapshot)).toEqual({});
    });
  });

  describe('recordChange', () => {
    it('should look up the previous version and create a new version row with it', async () => {
      const params: RecordChangeParams = {
        capabilityId: 'capability-id',
        changeType: CapabilityVersionChangeType.UPDATE,
        beforeSnapshot: { uniqueName: 'Old Name', stewardId: null },
        afterSnapshot: { uniqueName: 'New Name', stewardId: 'steward-1' },
        changedBy: 'steward-1',
      };
      const changedFields = {
        uniqueName: {
          before: 'Old Name',
          after: 'New Name',
        },
      };
      const ensureDraftVersionIdSpy = jest
        .spyOn(service, 'ensureDraftVersionId')
        .mockResolvedValue('draft-version-id');
      jest.spyOn(service, 'computeChangedFields').mockReturnValue(changedFields);
      prisma.capabilityVersion.findFirst.mockResolvedValue({ id: 'previous-version-id' });

      await service.recordChange(tx, params);

      expect(ensureDraftVersionIdSpy).toHaveBeenCalledWith(tx, 'steward-1');
      expect(prisma.capabilityVersion.findFirst).toHaveBeenCalledWith({
        where: { capabilityId: 'capability-id' },
        orderBy: { changedAt: 'desc' },
        select: { id: true },
      });
      expect(prisma.capabilityVersion.create).toHaveBeenCalledWith({
        data: {
          capabilityId: 'capability-id',
          modelVersionId: 'draft-version-id',
          changeType: CapabilityVersionChangeType.UPDATE,
          changedFields,
          beforeSnapshot: { uniqueName: 'Old Name', stewardId: null },
          afterSnapshot: { uniqueName: 'New Name', stewardId: 'steward-1' },
          changedBy: 'steward-1',
          previousVersionId: 'previous-version-id',
        },
      });

      expect(ensureDraftVersionIdSpy.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.capabilityVersion.findFirst.mock.invocationCallOrder[0],
      );
      expect(prisma.capabilityVersion.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.capabilityVersion.create.mock.invocationCallOrder[0],
      );
    });

    it('should create a first capability version row with a null previousVersionId', async () => {
      const params: RecordChangeParams = {
        capabilityId: 'capability-id',
        changeType: CapabilityVersionChangeType.DELETE,
        beforeSnapshot: { uniqueName: 'Payments' },
        afterSnapshot: null,
        changedBy: 'steward-1',
      };
      const ensureDraftVersionIdSpy = jest
        .spyOn(service, 'ensureDraftVersionId')
        .mockResolvedValue('draft-version-id');
      jest.spyOn(service, 'computeChangedFields').mockReturnValue({
        uniqueName: { before: 'Payments', after: null },
      });
      prisma.capabilityVersion.findFirst.mockResolvedValue(null);

      await service.recordChange(tx, params);

      expect(ensureDraftVersionIdSpy).toHaveBeenCalledWith(tx, 'steward-1');
      expect(prisma.capabilityVersion.create).toHaveBeenCalledWith({
        data: {
          capabilityId: 'capability-id',
          modelVersionId: 'draft-version-id',
          changeType: CapabilityVersionChangeType.DELETE,
          changedFields: {
            uniqueName: { before: 'Payments', after: null },
          },
          beforeSnapshot: { uniqueName: 'Payments' },
          afterSnapshot: Prisma.JsonNull,
          changedBy: 'steward-1',
          previousVersionId: null,
        },
      });
    });
  });

  describe('ensureDraftVersionId', () => {
    it('should return an existing draft id when one is found', async () => {
      prisma.modelVersion.findFirst.mockResolvedValue({ id: 'existing-draft-id' });

      const result = await service.ensureDraftVersionId(tx, 'steward-1');

      expect(result).toBe('existing-draft-id');
      expect(prisma.modelVersion.findFirst).toHaveBeenCalledWith({
        where: {
          state: ModelVersionState.DRAFT,
          branchType: BranchType.MAIN,
        },
        select: { id: true },
      });
      expect(prisma.modelVersion.create).not.toHaveBeenCalled();
    });

    it('should create a new draft when one does not exist', async () => {
      prisma.modelVersion.findFirst.mockResolvedValue(null);
      prisma.modelVersion.create.mockResolvedValue({ id: 'new-draft-id' });

      const result = await service.ensureDraftVersionId(tx, 'steward-1');

      expect(result).toBe('new-draft-id');
      expect(prisma.modelVersion.create).toHaveBeenCalledWith({
        data: {
          versionLabel: expect.stringMatching(/^draft-\d+$/),
          state: ModelVersionState.DRAFT,
          branchType: BranchType.MAIN,
          createdBy: 'steward-1',
        },
        select: { id: true },
      });
    });
  });

  describe('getHistory', () => {
    it('should request the correct page and return paginated capability history', async () => {
      const items = [
        createHistoryItem({ id: 'cv-1' }),
        createHistoryItem({ id: 'cv-2' }),
      ];
      prisma.capabilityVersion.findMany.mockResolvedValue(items);
      prisma.capabilityVersion.count.mockResolvedValue(11);

      const result = await service.getHistory('capability-id', { page: 2, limit: 5 });

      expect(prisma.capabilityVersion.findMany).toHaveBeenCalledWith({
        where: { capabilityId: 'capability-id' },
        orderBy: { changedAt: 'desc' },
        skip: 5,
        take: 5,
        include: {
          modelVersion: {
            select: {
              id: true,
              versionLabel: true,
              state: true,
              publishedAt: true,
            },
          },
        },
      });
      expect(prisma.capabilityVersion.count).toHaveBeenCalledWith({
        where: { capabilityId: 'capability-id' },
      });
      expect(result).toEqual({
        items,
        total: 11,
        page: 2,
        limit: 5,
        totalPages: 3,
        capabilityId: 'capability-id',
      });
    });
  });

  describe('recordChangeDirect', () => {
    it('should wrap recordChange in a Prisma transaction', async () => {
      const params: RecordChangeParams = {
        capabilityId: 'capability-id',
        changeType: CapabilityVersionChangeType.CREATE,
        beforeSnapshot: null,
        afterSnapshot: { uniqueName: 'Payments' },
        changedBy: 'steward-1',
      };
      const recordChangeSpy = jest.spyOn(service, 'recordChange').mockResolvedValue(undefined);

      await service.recordChangeDirect(params);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(recordChangeSpy).toHaveBeenCalledWith(tx, params);
    });
  });
});
