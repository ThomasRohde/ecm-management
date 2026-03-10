import { BadRequestException } from '@nestjs/common';
import {
  BranchType,
  ModelVersionState,
  type ModelVersion,
} from '@prisma/client';
import type { CapabilityService } from '../../capability/capability.service';
import type { PublishedCapability, PublishedModelService } from '../../integration/published-model.service';
import { ExportService } from '../export.service';
import { CapabilityExportScope, ExportFormat } from '../export.types';

function createCapabilityListItem(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'capability-1',
    uniqueName: 'Payments',
    aliases: ['Pay'],
    description: 'Capability description',
    domain: 'Finance',
    type: 'LEAF',
    parentId: null,
    lifecycleStatus: 'ACTIVE',
    effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
    effectiveTo: null,
    rationale: 'Core capability',
    sourceReferences: ['ref-1'],
    tags: ['core'],
    stewardId: 'steward-1',
    stewardDepartment: 'Finance',
    nameGuardrailOverride: false,
    nameGuardrailOverrideRationale: null,
    isErroneous: false,
    erroneousReason: null,
    children: [],
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    ...overrides,
  };
}

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
    publishedAt: new Date('2026-03-01T00:00:00.000Z'),
    rollbackOfVersionId: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    ...overrides,
  };
}

function createPublishedCapability(
  overrides: Partial<PublishedCapability> = {},
): PublishedCapability {
  return {
    id: 'capability-1',
    uniqueName: 'Payments',
    aliases: ['Pay'],
    description: 'Capability description',
    domain: 'Finance',
    type: 'LEAF',
    parentId: null,
    lifecycleStatus: 'ACTIVE',
    effectiveFrom: '2026-03-01T00:00:00.000Z',
    effectiveTo: null,
    rationale: 'Core capability',
    sourceReferences: ['ref-1'],
    tags: ['core'],
    stewardId: 'steward-1',
    stewardDepartment: 'Finance',
    nameGuardrailOverride: false,
    nameGuardrailOverrideRationale: null,
    isErroneous: false,
    erroneousReason: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('ExportService', () => {
  function makeService() {
    const capabilityService = {
      findAll: jest.fn(),
    } as unknown as CapabilityService;

    const publishedModelService = {
      listCapabilities: jest.fn(),
      getCapabilitySubtree: jest.fn(),
    } as unknown as PublishedModelService;

    return {
      service: new ExportService(capabilityService, publishedModelService),
      capabilityService,
      publishedModelService,
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exports filtered capabilities as CSV using the main capability read model', async () => {
    const { service, capabilityService } = makeService();
    capabilityService.findAll = jest.fn().mockResolvedValue({
      items: [
        createCapabilityListItem({
          uniqueName: 'Payments, Core',
          aliases: ['Pay "Core"'],
          description: 'Line 1\nLine 2',
          sourceReferences: ['ref-1', 'ref,2'],
          tags: ['core', 'finance'],
          children: [{ id: 'child-1' }],
        }),
      ],
      total: 1,
      page: 1,
      limit: 10_000,
      totalPages: 1,
    });

    const result = await service.exportCapabilitiesCsv({ search: 'Payments' });

    expect(capabilityService.findAll).toHaveBeenCalledWith({
      search: 'Payments',
      page: 1,
      limit: 10_000,
    });
    expect(result).toMatchObject({
      filename: 'capabilities-export.csv',
      generatedAt: '2026-03-10T12:00:00.000Z',
      total: 1,
    });
    expect(result.content).toContain(
      'id,uniqueName,description,domain,type,parentId,lifecycleStatus,aliases',
    );
    expect(result.content).toContain('"Payments, Core"');
    expect(result.content).toContain('"Pay ""Core"""');
    expect(result.content).toContain('"Line 1\nLine 2"');
    expect(result.content).toContain('"ref-1; ref,2"');
    expect(result.content).toContain('core; finance');
    expect(result.content).toContain(',1,2026-03-01T00:00:00.000Z,2026-03-02T00:00:00.000Z');
  });

  it('rejects capability CSV exports that would be truncated', async () => {
    const { service, capabilityService } = makeService();
    capabilityService.findAll = jest.fn().mockResolvedValue({
      items: [createCapabilityListItem()],
      total: 10_001,
      page: 1,
      limit: 10_000,
      totalPages: 2,
    });

    await expect(service.exportCapabilitiesCsv({})).rejects.toThrow(BadRequestException);
  });

  it('wraps the current published model in export metadata', async () => {
    const { service, publishedModelService } = makeService();
    publishedModelService.listCapabilities = jest.fn().mockResolvedValue({
      release: createRelease(),
      items: [createPublishedCapability()],
      total: 1,
    });

    await expect(service.exportPublishedModel()).resolves.toEqual({
      data: {
        release: {
          id: '00000000-0000-0000-0000-000000000001',
          versionLabel: 'release-1',
          state: 'PUBLISHED',
          baseVersionId: null,
          branchType: 'MAIN',
          branchName: null,
          description: null,
          notes: null,
          createdBy: 'tester',
          approvedBy: 'approver',
          publishedAt: '2026-03-01T00:00:00.000Z',
          rollbackOfVersionId: null,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
        items: [createPublishedCapability()],
        total: 1,
      },
      meta: {
        generatedAt: '2026-03-10T12:00:00.000Z',
        format: ExportFormat.JSON,
        scope: CapabilityExportScope.FULL_MODEL,
        filename: 'published-capability-model-export.json',
      },
    });
  });

  it('wraps the current published subtree in export metadata', async () => {
    const { service, publishedModelService } = makeService();
    publishedModelService.getCapabilitySubtree = jest.fn().mockResolvedValue({
      release: createRelease(),
      rootCapabilityId: '00000000-0000-0000-0000-000000000010',
      items: [createPublishedCapability({ id: '00000000-0000-0000-0000-000000000010' })],
      total: 1,
    });

    await expect(
      service.exportPublishedSubtree('00000000-0000-0000-0000-000000000010'),
    ).resolves.toEqual({
      data: {
        release: {
          id: '00000000-0000-0000-0000-000000000001',
          versionLabel: 'release-1',
          state: 'PUBLISHED',
          baseVersionId: null,
          branchType: 'MAIN',
          branchName: null,
          description: null,
          notes: null,
          createdBy: 'tester',
          approvedBy: 'approver',
          publishedAt: '2026-03-01T00:00:00.000Z',
          rollbackOfVersionId: null,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
        rootCapabilityId: '00000000-0000-0000-0000-000000000010',
        items: [
          createPublishedCapability({ id: '00000000-0000-0000-0000-000000000010' }),
        ],
        total: 1,
      },
      meta: {
        generatedAt: '2026-03-10T12:00:00.000Z',
        format: ExportFormat.JSON,
        scope: CapabilityExportScope.SUBTREE,
        filename: 'published-capability-subtree-00000000-0000-0000-0000-000000000010.json',
      },
    });
  });
});
