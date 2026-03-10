import { NotFoundException } from '@nestjs/common';
import {
  BranchType,
  ModelVersionState,
  type ModelVersion,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ModelVersionService } from '../../versioning/model-version.service';
import { PublishedModelService } from '../published-model.service';

function createRelease(overrides: Partial<ModelVersion> = {}): ModelVersion {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    versionLabel: 'release-1',
    state: ModelVersionState.PUBLISHED,
    baseVersionId: null,
    branchType: BranchType.MAIN,
    branchName: null,
    description: null,
    notes: null,
    createdBy: 'tester',
    approvedBy: 'approver',
    publishedAt: new Date('2025-01-01T00:00:00.000Z'),
    rollbackOfVersionId: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('PublishedModelService', () => {
  function makeService() {
    const prisma = {
      modelVersion: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;

    const modelVersionService = {
      getCapabilityStateAtVersion: jest.fn(),
      computeDiff: jest.fn(),
    } as unknown as ModelVersionService;

    return {
      service: new PublishedModelService(prisma, modelVersionService),
      prisma,
      modelVersionService,
    };
  }

  it('returns normalized capabilities from the latest published release', async () => {
    const { service, prisma, modelVersionService } = makeService();
    prisma.modelVersion.findFirst = jest.fn().mockResolvedValue(createRelease());
    modelVersionService.getCapabilityStateAtVersion = jest.fn().mockResolvedValue(
      new Map([
        [
          'cap-1',
          {
            uniqueName: 'Payments',
            aliases: ['Pay'],
            description: 'Capability description',
            domain: 'Finance',
            type: 'LEAF',
            parentId: null,
            lifecycleStatus: 'ACTIVE',
            effectiveFrom: '2025-01-02T00:00:00.000Z',
            effectiveTo: null,
            rationale: 'Core capability',
            sourceReferences: ['ref-1'],
            tags: ['core'],
            stewardId: 'steward-1',
            stewardDepartment: 'Operations',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: new Date('2025-01-03T00:00:00.000Z'),
          },
        ],
        ['cap-2', null],
      ]),
    );

    const result = await service.listCapabilities();

    expect(prisma.modelVersion.findFirst).toHaveBeenCalledWith({
      where: {
        branchType: BranchType.MAIN,
        state: ModelVersionState.PUBLISHED,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    expect(result.total).toBe(1);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'cap-1',
        uniqueName: 'Payments',
        nameGuardrailOverride: false,
        isErroneous: false,
        updatedAt: '2025-01-03T00:00:00.000Z',
      }),
    ]);
  });

  it('returns a parent-first subtree from the latest published release', async () => {
    const { service, prisma, modelVersionService } = makeService();
    prisma.modelVersion.findFirst = jest.fn().mockResolvedValue(createRelease());
    modelVersionService.getCapabilityStateAtVersion = jest.fn().mockResolvedValue(
      new Map([
        [
          'root',
          {
            uniqueName: 'Root',
            aliases: [],
            description: null,
            domain: null,
            type: 'ABSTRACT',
            parentId: null,
            lifecycleStatus: 'ACTIVE',
            sourceReferences: [],
            tags: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        [
          'child-a',
          {
            uniqueName: 'Child A',
            aliases: [],
            description: null,
            domain: null,
            type: 'LEAF',
            parentId: 'root',
            lifecycleStatus: 'ACTIVE',
            sourceReferences: [],
            tags: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        [
          'grandchild',
          {
            uniqueName: 'Grandchild',
            aliases: [],
            description: null,
            domain: null,
            type: 'LEAF',
            parentId: 'child-a',
            lifecycleStatus: 'ACTIVE',
            sourceReferences: [],
            tags: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        [
          'sibling',
          {
            uniqueName: 'Sibling',
            aliases: [],
            description: null,
            domain: null,
            type: 'LEAF',
            parentId: null,
            lifecycleStatus: 'ACTIVE',
            sourceReferences: [],
            tags: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      ]),
    );

    const result = await service.getCapabilitySubtree('root');

    expect(result.items.map((item) => item.id)).toEqual([
      'root',
      'child-a',
      'grandchild',
    ]);
    expect(result.rootCapabilityId).toBe('root');
  });

  it('throws when the requested subtree root does not exist in the latest release', async () => {
    const { service, prisma, modelVersionService } = makeService();
    prisma.modelVersion.findFirst = jest.fn().mockResolvedValue(createRelease());
    modelVersionService.getCapabilityStateAtVersion = jest
      .fn()
      .mockResolvedValue(new Map<string, Record<string, unknown> | null>());

    await expect(service.getCapabilitySubtree('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lists published releases only', async () => {
    const { service, prisma } = makeService();
    prisma.modelVersion.findMany = jest
      .fn()
      .mockResolvedValue([createRelease(), createRelease({ id: 'release-2' })]);

    const result = await service.listReleases();

    expect(prisma.modelVersion.findMany).toHaveBeenCalledWith({
      where: {
        branchType: BranchType.MAIN,
        state: {
          in: [ModelVersionState.PUBLISHED, ModelVersionState.ROLLED_BACK],
        },
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    expect(result.total).toBe(2);
  });

  it('computes release diff from the base release when one exists', async () => {
    const { service, prisma, modelVersionService } = makeService();
    prisma.modelVersion.findFirst = jest.fn().mockResolvedValue(
      createRelease({
        id: 'release-2',
        baseVersionId: 'release-1',
      }),
    );
    modelVersionService.computeDiff = jest.fn().mockResolvedValue({ summary: {} });

    await service.getReleaseDiff('release-2');

    expect(modelVersionService.computeDiff).toHaveBeenCalledWith(
      'release-1',
      'release-2',
    );
  });
});
