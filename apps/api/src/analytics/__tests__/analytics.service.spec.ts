import {
  AuditAction,
  AuditEntityType,
  CapabilityType,
  LifecycleStatus,
  MappingState,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsService } from '../analytics.service';

type CapabilityRecord = {
  id: string;
  uniqueName: string;
  domain: string | null;
  type: CapabilityType;
  lifecycleStatus: LifecycleStatus;
  stewardId: string | null;
  stewardDepartment: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MappingRecord = {
  id: string;
  mappingType: string;
  systemId: string;
  capabilityId: string;
  state: MappingState;
  createdAt: Date;
  updatedAt: Date;
};

type AuditEntryRecord = {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actorId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  timestamp: Date;
};

function createCapabilityRecord(
  overrides: Partial<CapabilityRecord> = {},
): CapabilityRecord {
  return {
    id: 'capability-1',
    uniqueName: 'Payments',
    domain: 'Finance',
    type: CapabilityType.LEAF,
    lifecycleStatus: LifecycleStatus.ACTIVE,
    stewardId: 'steward-1',
    stewardDepartment: 'Finance',
    createdAt: new Date('2026-03-10T08:00:00.000Z'),
    updatedAt: new Date('2026-03-10T09:00:00.000Z'),
    ...overrides,
  };
}

function createMappingRecord(
  overrides: Partial<MappingRecord> = {},
): MappingRecord {
  return {
    id: 'mapping-1',
    mappingType: 'READS',
    systemId: 'system-a',
    capabilityId: 'capability-1',
    state: MappingState.ACTIVE,
    createdAt: new Date('2026-03-10T10:00:00.000Z'),
    updatedAt: new Date('2026-03-10T10:00:00.000Z'),
    ...overrides,
  };
}

function createAuditEntry(
  overrides: Partial<AuditEntryRecord> = {},
): AuditEntryRecord {
  return {
    id: 'audit-1',
    entityType: AuditEntityType.CAPABILITY,
    entityId: 'capability-1',
    action: AuditAction.CREATE,
    actorId: 'system',
    before: null,
    after: { uniqueName: 'Payments' },
    metadata: null,
    timestamp: new Date('2026-03-10T11:00:00.000Z'),
    ...overrides,
  };
}

describe('AnalyticsService', () => {
  function makeService() {
    const prisma = {
      $transaction: jest.fn().mockImplementation((operations: unknown[] | ((tx: unknown) => Promise<unknown>)) => {
        if (Array.isArray(operations)) {
          return Promise.all(operations as Promise<unknown>[]);
        }

        return operations(prisma);
      }),
      capability: {
        findMany: jest.fn(),
      },
      mapping: {
        findMany: jest.fn(),
      },
      auditEntry: {
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;

    return {
      prisma,
      service: new AnalyticsService(prisma),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes model health summary with status, type, domain, and coverage metrics', async () => {
    const { service, prisma } = makeService();

    prisma.capability.findMany = jest.fn().mockResolvedValue([
      createCapabilityRecord({ id: 'cap-1', uniqueName: 'Payments', domain: 'Finance' }),
      createCapabilityRecord({
        id: 'cap-2',
        uniqueName: 'Finance Planning',
        domain: 'Finance',
        type: CapabilityType.ABSTRACT,
        lifecycleStatus: LifecycleStatus.DRAFT,
        stewardId: null,
        stewardDepartment: null,
      }),
      createCapabilityRecord({
        id: 'cap-3',
        uniqueName: 'Warehouse Fulfilment',
        domain: 'Operations',
        stewardId: 'steward-2',
        stewardDepartment: null,
      }),
      createCapabilityRecord({
        id: 'cap-4',
        uniqueName: 'Legacy Reporting',
        domain: 'Operations',
        lifecycleStatus: LifecycleStatus.DEPRECATED,
        stewardId: 'steward-3',
        stewardDepartment: 'Operations',
      }),
      createCapabilityRecord({
        id: 'cap-5',
        uniqueName: 'Retired Capability',
        domain: null,
        lifecycleStatus: LifecycleStatus.RETIRED,
        stewardId: null,
        stewardDepartment: null,
      }),
    ]);
    prisma.mapping.findMany = jest.fn().mockResolvedValue([
      createMappingRecord({ capabilityId: 'cap-1', systemId: 'system-a' }),
      createMappingRecord({
        id: 'mapping-2',
        capabilityId: 'cap-4',
        mappingType: 'MANAGES',
        systemId: 'system-b',
      }),
      createMappingRecord({
        id: 'mapping-3',
        capabilityId: 'cap-5',
        mappingType: 'CONSUMES',
        systemId: 'system-c',
        state: MappingState.INACTIVE,
      }),
      createMappingRecord({
        id: 'mapping-ignored',
        capabilityId: 'branch-local-capability',
        systemId: 'system-z',
      }),
    ]);

    const result = await service.getModelHealthSummary();

    expect(result).toEqual({
      totalCapabilities: 5,
      totalLeafCapabilities: 4,
      totalMappings: 3,
      mappedCapabilities: 3,
      mappedLeafCapabilities: 3,
      lifecycleStatusCounts: {
        [LifecycleStatus.DRAFT]: 1,
        [LifecycleStatus.ACTIVE]: 2,
        [LifecycleStatus.DEPRECATED]: 1,
        [LifecycleStatus.RETIRED]: 1,
      },
      capabilityTypeCounts: {
        [CapabilityType.ABSTRACT]: 1,
        [CapabilityType.LEAF]: 4,
      },
      domainBreakdown: [
        {
          domain: 'Finance',
          capabilityCount: 2,
          leafCapabilityCount: 1,
          mappedCapabilityCount: 1,
          mappedLeafCapabilityCount: 1,
          stewardshipCoverageCount: 1,
          lifecycleStatusCounts: {
            [LifecycleStatus.DRAFT]: 1,
            [LifecycleStatus.ACTIVE]: 1,
            [LifecycleStatus.DEPRECATED]: 0,
            [LifecycleStatus.RETIRED]: 0,
          },
          capabilityTypeCounts: {
            [CapabilityType.ABSTRACT]: 1,
            [CapabilityType.LEAF]: 1,
          },
        },
        {
          domain: 'Operations',
          capabilityCount: 2,
          leafCapabilityCount: 2,
          mappedCapabilityCount: 1,
          mappedLeafCapabilityCount: 1,
          stewardshipCoverageCount: 1,
          lifecycleStatusCounts: {
            [LifecycleStatus.DRAFT]: 0,
            [LifecycleStatus.ACTIVE]: 1,
            [LifecycleStatus.DEPRECATED]: 1,
            [LifecycleStatus.RETIRED]: 0,
          },
          capabilityTypeCounts: {
            [CapabilityType.ABSTRACT]: 0,
            [CapabilityType.LEAF]: 2,
          },
        },
        {
          domain: null,
          capabilityCount: 1,
          leafCapabilityCount: 1,
          mappedCapabilityCount: 1,
          mappedLeafCapabilityCount: 1,
          stewardshipCoverageCount: 0,
          lifecycleStatusCounts: {
            [LifecycleStatus.DRAFT]: 0,
            [LifecycleStatus.ACTIVE]: 0,
            [LifecycleStatus.DEPRECATED]: 0,
            [LifecycleStatus.RETIRED]: 1,
          },
          capabilityTypeCounts: {
            [CapabilityType.ABSTRACT]: 0,
            [CapabilityType.LEAF]: 1,
          },
        },
      ],
      stewardshipCoverage: {
        covered: 2,
        total: 5,
        percentage: 40,
      },
      mappingCoverage: {
        covered: 3,
        total: 4,
        percentage: 75,
      },
    });
  });

  it('builds stewardship coverage with domain breakdowns and a steward leaderboard', async () => {
    const { service, prisma } = makeService();

    prisma.capability.findMany = jest.fn().mockResolvedValue([
      createCapabilityRecord({ id: 'cap-1', domain: 'Finance', stewardId: 'steward-1' }),
      createCapabilityRecord({ id: 'cap-2', uniqueName: 'Billing', domain: 'Finance', stewardId: 'steward-1' }),
      createCapabilityRecord({
        id: 'cap-3',
        domain: 'Operations',
        stewardId: 'steward-2',
        stewardDepartment: null,
      }),
      createCapabilityRecord({
        id: 'cap-4',
        uniqueName: 'Archived',
        domain: null,
        stewardId: null,
        stewardDepartment: null,
      }),
    ]);
    prisma.mapping.findMany = jest.fn().mockResolvedValue([]);

    const result = await service.getStewardshipCoverage();

    expect(result).toEqual({
      totalCapabilities: 4,
      stewardAssignedCount: 3,
      stewardDepartmentAssignedCount: 2,
      fullyCoveredCount: 2,
      coverage: {
        covered: 2,
        total: 4,
        percentage: 50,
      },
      byDomain: [
        {
          domain: 'Finance',
          totalCapabilities: 2,
          stewardAssignedCount: 2,
          stewardDepartmentAssignedCount: 2,
          fullyCoveredCount: 2,
          coveragePercentage: 100,
        },
        {
          domain: 'Operations',
          totalCapabilities: 1,
          stewardAssignedCount: 1,
          stewardDepartmentAssignedCount: 0,
          fullyCoveredCount: 0,
          coveragePercentage: 0,
        },
        {
          domain: null,
          totalCapabilities: 1,
          stewardAssignedCount: 0,
          stewardDepartmentAssignedCount: 0,
          fullyCoveredCount: 0,
          coveragePercentage: 0,
        },
      ],
      topStewards: [
        {
          stewardId: 'steward-1',
          capabilityCount: 2,
          domains: ['Finance'],
        },
        {
          stewardId: 'steward-2',
          capabilityCount: 1,
          domains: ['Operations'],
        },
      ],
    });
  });

  it('builds mapping coverage and heatmap cells with zero-value status cells', async () => {
    const { service, prisma } = makeService();

    prisma.capability.findMany = jest.fn().mockResolvedValue([
      createCapabilityRecord({ id: 'cap-1', domain: 'Finance' }),
      createCapabilityRecord({
        id: 'cap-2',
        uniqueName: 'Finance Architecture',
        domain: 'Finance',
        type: CapabilityType.ABSTRACT,
        lifecycleStatus: LifecycleStatus.DRAFT,
        stewardId: null,
        stewardDepartment: null,
      }),
      createCapabilityRecord({
        id: 'cap-3',
        uniqueName: 'Warehouse Fulfilment',
        domain: 'Operations',
        stewardId: null,
        stewardDepartment: null,
      }),
    ]);
    prisma.mapping.findMany = jest.fn().mockResolvedValue([
      createMappingRecord({ capabilityId: 'cap-1', mappingType: 'READS', systemId: 'erp' }),
    ]);

    const mappingCoverage = await service.getMappingCoverage();
    const heatmap = await service.getHeatmap();

    expect(mappingCoverage).toEqual({
      totalMappings: 1,
      systemsCount: 1,
      mappedCapabilities: 1,
      mappedLeafCapabilities: 1,
      activeMappedLeafCapabilities: 1,
      coverage: {
        covered: 1,
        total: 2,
        percentage: 50,
      },
      activeCoverage: {
        covered: 1,
        total: 2,
        percentage: 50,
      },
      mappingStateCounts: {
        [MappingState.ACTIVE]: 1,
        [MappingState.INACTIVE]: 0,
        [MappingState.PENDING]: 0,
      },
      mappingTypeCounts: [
        {
          mappingType: 'READS',
          count: 1,
        },
      ],
      byDomain: [
        {
          domain: 'Finance',
          totalLeafCapabilities: 1,
          mappedLeafCapabilities: 1,
          activeMappedLeafCapabilities: 1,
          coveragePercentage: 100,
        },
        {
          domain: 'Operations',
          totalLeafCapabilities: 1,
          mappedLeafCapabilities: 0,
          activeMappedLeafCapabilities: 0,
          coveragePercentage: 0,
        },
      ],
    });

    expect(heatmap).toEqual([
      {
        domain: 'Finance',
        lifecycleStatus: LifecycleStatus.DRAFT,
        capabilityCount: 1,
        mappedCapabilityCount: 0,
        mappedLeafCapabilityCount: 0,
        stewardshipCoverageCount: 0,
      },
      {
        domain: 'Finance',
        lifecycleStatus: LifecycleStatus.ACTIVE,
        capabilityCount: 1,
        mappedCapabilityCount: 1,
        mappedLeafCapabilityCount: 1,
        stewardshipCoverageCount: 1,
      },
      {
        domain: 'Finance',
        lifecycleStatus: LifecycleStatus.DEPRECATED,
        capabilityCount: 0,
        mappedCapabilityCount: 0,
        mappedLeafCapabilityCount: 0,
        stewardshipCoverageCount: 0,
      },
      {
        domain: 'Finance',
        lifecycleStatus: LifecycleStatus.RETIRED,
        capabilityCount: 0,
        mappedCapabilityCount: 0,
        mappedLeafCapabilityCount: 0,
        stewardshipCoverageCount: 0,
      },
      {
        domain: 'Operations',
        lifecycleStatus: LifecycleStatus.DRAFT,
        capabilityCount: 0,
        mappedCapabilityCount: 0,
        mappedLeafCapabilityCount: 0,
        stewardshipCoverageCount: 0,
      },
      {
        domain: 'Operations',
        lifecycleStatus: LifecycleStatus.ACTIVE,
        capabilityCount: 1,
        mappedCapabilityCount: 0,
        mappedLeafCapabilityCount: 0,
        stewardshipCoverageCount: 0,
      },
      {
        domain: 'Operations',
        lifecycleStatus: LifecycleStatus.DEPRECATED,
        capabilityCount: 0,
        mappedCapabilityCount: 0,
        mappedLeafCapabilityCount: 0,
        stewardshipCoverageCount: 0,
      },
      {
        domain: 'Operations',
        lifecycleStatus: LifecycleStatus.RETIRED,
        capabilityCount: 0,
        mappedCapabilityCount: 0,
        mappedLeafCapabilityCount: 0,
        stewardshipCoverageCount: 0,
      },
    ]);
  });

  it('returns gap analysis filtered by domain and limited per result list', async () => {
    const { service, prisma } = makeService();

    prisma.capability.findMany = jest.fn().mockResolvedValue([
      createCapabilityRecord({ id: 'cap-1', uniqueName: 'Accounts Payable', domain: 'Finance' }),
      createCapabilityRecord({ id: 'cap-2', uniqueName: 'Budgeting', domain: 'Finance' }),
      createCapabilityRecord({
        id: 'cap-3',
        uniqueName: 'Invoice Matching',
        domain: 'Finance',
      }),
      createCapabilityRecord({
        id: 'cap-4',
        uniqueName: 'Warehouse Fulfilment',
        domain: 'Operations',
      }),
      createCapabilityRecord({
        id: 'cap-5',
        uniqueName: 'Legacy Finance Reporting',
        domain: 'Finance',
        lifecycleStatus: LifecycleStatus.DEPRECATED,
      }),
      createCapabilityRecord({
        id: 'cap-6',
        uniqueName: 'Legacy Ops Reporting',
        domain: 'Operations',
        lifecycleStatus: LifecycleStatus.DEPRECATED,
      }),
    ]);
    prisma.mapping.findMany = jest.fn().mockResolvedValue([
      createMappingRecord({
        capabilityId: 'cap-3',
        systemId: 'erp',
      }),
      createMappingRecord({
        id: 'mapping-2',
        capabilityId: 'cap-5',
        systemId: 'finance-dwh',
        state: MappingState.ACTIVE,
      }),
      createMappingRecord({
        id: 'mapping-3',
        capabilityId: 'cap-6',
        systemId: 'ops-dwh',
        state: MappingState.INACTIVE,
      }),
    ]);

    const result = await service.getGapAnalysis({
      domain: 'Finance',
      limit: 1,
    });

    expect(result).toEqual({
      summary: {
        unmappedActiveLeafCapabilityCount: 2,
        deprecatedCapabilitiesWithActiveMappingsCount: 1,
      },
      appliedFilters: {
        domain: 'Finance',
        limit: 1,
      },
      unmappedActiveLeafCapabilities: [
        {
          id: 'cap-1',
          uniqueName: 'Accounts Payable',
          domain: 'Finance',
          lifecycleStatus: LifecycleStatus.ACTIVE,
          stewardId: 'steward-1',
          stewardDepartment: 'Finance',
          updatedAt: '2026-03-10T09:00:00.000Z',
        },
      ],
      deprecatedCapabilitiesWithActiveMappings: [
        {
          id: 'cap-5',
          uniqueName: 'Legacy Finance Reporting',
          domain: 'Finance',
          lifecycleStatus: LifecycleStatus.DEPRECATED,
          stewardId: 'steward-1',
          stewardDepartment: 'Finance',
          updatedAt: '2026-03-10T09:00:00.000Z',
          activeMappingCount: 1,
          systems: ['finance-dwh'],
        },
      ],
    });
  });

  it('formats recent activity from audit entries and filters to model-related entity types', async () => {
    const { service, prisma } = makeService();

    prisma.auditEntry.findMany = jest.fn().mockResolvedValue([
      createAuditEntry({
        id: 'audit-1',
        entityType: AuditEntityType.CAPABILITY,
        action: AuditAction.CREATE,
        actorId: 'system',
        after: { uniqueName: 'Payments' },
      }),
      createAuditEntry({
        id: 'audit-2',
        entityType: AuditEntityType.MAPPING,
        entityId: 'mapping-2',
        action: AuditAction.UPDATE,
        actorId: 'steward-1',
        after: { systemId: 'erp', capabilityId: 'capability-1' },
      }),
      createAuditEntry({
        id: 'audit-3',
        entityType: AuditEntityType.MODEL_VERSION,
        entityId: 'version-1',
        action: AuditAction.PUBLISH,
        actorId: 'curator-1',
        after: { versionLabel: '2026.03' },
      }),
    ]);

    const result = await service.getRecentActivity({ limit: 3 });

    expect(prisma.auditEntry.findMany).toHaveBeenCalledWith({
      where: {
        entityType: {
          in: [
            AuditEntityType.CAPABILITY,
            AuditEntityType.MAPPING,
            AuditEntityType.CHANGE_REQUEST,
            AuditEntityType.MODEL_VERSION,
          ],
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 3,
    });
    expect(result).toEqual({
      items: [
        {
          id: 'audit-1',
          entityType: AuditEntityType.CAPABILITY,
          entityId: 'capability-1',
          action: AuditAction.CREATE,
          actorId: 'system',
          occurredAt: '2026-03-10T11:00:00.000Z',
          summary: 'system created capability "Payments"',
        },
        {
          id: 'audit-2',
          entityType: AuditEntityType.MAPPING,
          entityId: 'mapping-2',
          action: AuditAction.UPDATE,
          actorId: 'steward-1',
          occurredAt: '2026-03-10T11:00:00.000Z',
          summary: 'steward-1 updated mapping erp → capability-1',
        },
        {
          id: 'audit-3',
          entityType: AuditEntityType.MODEL_VERSION,
          entityId: 'version-1',
          action: AuditAction.PUBLISH,
          actorId: 'curator-1',
          occurredAt: '2026-03-10T11:00:00.000Z',
          summary: 'curator-1 published model version "2026.03"',
        },
      ],
      totalReturned: 3,
    });
  });
});
