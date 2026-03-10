import { Test, type TestingModule } from '@nestjs/testing';
import { ChangeRequestType, MappingState } from '@prisma/client';
import {
  ImpactAnalysisService,
  ImpactSeverity,
  computeSeverity,
  type ImpactedSystem,
} from '../impact-analysis.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const mockPrismaService = {
  mapping: {
    findMany: jest.fn(),
  },
  changeRequest: {
    findUnique: jest.fn(),
  },
};

function makeMapping(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mapping-1',
    mappingType: 'CONSUMES',
    systemId: 'system-a',
    capabilityId: 'cap-1',
    state: MappingState.ACTIVE,
    attributes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    capability: { id: 'cap-1', uniqueName: 'Order Management' },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeSeverity', () => {
  it('returns LOW when there are no mappings', () => {
    expect(computeSeverity(0, 0, ChangeRequestType.RETIRE)).toBe(ImpactSeverity.LOW);
  });

  it('returns MEDIUM when there are only inactive mappings', () => {
    expect(computeSeverity(0, 2, ChangeRequestType.RETIRE)).toBe(ImpactSeverity.MEDIUM);
  });

  it('returns MEDIUM for active mappings with a non-destructive op type', () => {
    expect(computeSeverity(3, 3, ChangeRequestType.REPARENT)).toBe(ImpactSeverity.MEDIUM);
  });

  it('returns MEDIUM for active mappings when no op type is given', () => {
    expect(computeSeverity(1, 1, undefined)).toBe(ImpactSeverity.MEDIUM);
  });

  it('returns HIGH for RETIRE with active mappings', () => {
    expect(computeSeverity(2, 2, ChangeRequestType.RETIRE)).toBe(ImpactSeverity.HIGH);
  });

  it('returns HIGH for MERGE with active mappings', () => {
    expect(computeSeverity(1, 1, ChangeRequestType.MERGE)).toBe(ImpactSeverity.HIGH);
  });

  it('returns MEDIUM for RETIRE with 0 active but some total mappings', () => {
    // Inactive mappings still deserve a MEDIUM flag so they aren't silently dropped.
    expect(computeSeverity(0, 3, ChangeRequestType.RETIRE)).toBe(ImpactSeverity.MEDIUM);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ImpactAnalysisService', () => {
  let service: ImpactAnalysisService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImpactAnalysisService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ImpactAnalysisService>(ImpactAnalysisService);
    prisma = module.get(PrismaService);
  });

  // ── analyse ───────────────────────────────────────────────────────────────

  describe('analyse', () => {
    it('returns an empty result for an empty capability list', async () => {
      const result = await service.analyse([]);

      expect(prisma.mapping.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        capabilityIds: [],
        impactedMappings: [],
        impactedSystems: [],
        summary: {
          totalMappings: 0,
          activeMappings: 0,
          inactiveMappings: 0,
          pendingMappings: 0,
          affectedSystemCount: 0,
          severity: ImpactSeverity.LOW,
        },
      });
    });

    it('returns LOW severity and empty lists when no mappings exist', async () => {
      prisma.mapping.findMany.mockResolvedValue([]);

      const result = await service.analyse(['cap-1'], ChangeRequestType.RETIRE);

      expect(result.summary.severity).toBe(ImpactSeverity.LOW);
      expect(result.impactedMappings).toHaveLength(0);
      expect(result.impactedSystems).toHaveLength(0);
    });

    it('populates impactedMappings with ISO string dates', async () => {
      const m = makeMapping();
      prisma.mapping.findMany.mockResolvedValue([m]);

      const result = await service.analyse(['cap-1'], ChangeRequestType.UPDATE);

      expect(result.impactedMappings).toHaveLength(1);
      const mapped = result.impactedMappings[0];
      expect(mapped.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(mapped.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('groups mappings by systemId into impactedSystems', async () => {
      prisma.mapping.findMany.mockResolvedValue([
        makeMapping({ id: 'm-1', systemId: 'system-a', state: MappingState.ACTIVE }),
        makeMapping({ id: 'm-2', systemId: 'system-a', state: MappingState.INACTIVE }),
        makeMapping({ id: 'm-3', systemId: 'system-b', state: MappingState.ACTIVE }),
      ]);

      const result = await service.analyse(['cap-1']);

      const systemA = result.impactedSystems.find((s: ImpactedSystem) => s.systemId === 'system-a');
      const systemB = result.impactedSystems.find((s: ImpactedSystem) => s.systemId === 'system-b');

      expect(systemA?.mappingIds).toHaveLength(2);
      expect(systemA?.activeMappingCount).toBe(1);
      expect(systemB?.activeMappingCount).toBe(1);
      expect(result.summary.affectedSystemCount).toBe(2);
    });

    it('computes accurate state breakdowns in summary', async () => {
      prisma.mapping.findMany.mockResolvedValue([
        makeMapping({ id: 'm-1', state: MappingState.ACTIVE }),
        makeMapping({ id: 'm-2', state: MappingState.INACTIVE }),
        makeMapping({ id: 'm-3', state: MappingState.PENDING }),
      ]);

      const result = await service.analyse(['cap-1']);

      expect(result.summary.totalMappings).toBe(3);
      expect(result.summary.activeMappings).toBe(1);
      expect(result.summary.inactiveMappings).toBe(1);
      expect(result.summary.pendingMappings).toBe(1);
    });

    it('assigns HIGH severity for RETIRE with active mappings', async () => {
      prisma.mapping.findMany.mockResolvedValue([
        makeMapping({ state: MappingState.ACTIVE }),
      ]);

      const result = await service.analyse(['cap-1'], ChangeRequestType.RETIRE);

      expect(result.summary.severity).toBe(ImpactSeverity.HIGH);
    });

    it('assigns HIGH severity for MERGE with active mappings', async () => {
      prisma.mapping.findMany.mockResolvedValue([
        makeMapping({ state: MappingState.ACTIVE }),
      ]);

      const result = await service.analyse(['cap-1', 'cap-2'], ChangeRequestType.MERGE);

      expect(result.summary.severity).toBe(ImpactSeverity.HIGH);
    });

    it('assigns MEDIUM severity for REPARENT with active mappings', async () => {
      prisma.mapping.findMany.mockResolvedValue([
        makeMapping({ state: MappingState.ACTIVE }),
      ]);

      const result = await service.analyse(['cap-1'], ChangeRequestType.REPARENT);

      expect(result.summary.severity).toBe(ImpactSeverity.MEDIUM);
    });

    it('includes capabilityIds in the result', async () => {
      prisma.mapping.findMany.mockResolvedValue([]);

      const result = await service.analyse(['cap-1', 'cap-2']);

      expect(result.capabilityIds).toEqual(['cap-1', 'cap-2']);
    });

    it('queries mappings with IN filter over all supplied capabilityIds', async () => {
      prisma.mapping.findMany.mockResolvedValue([]);

      await service.analyse(['cap-1', 'cap-2', 'cap-3']);

      expect(prisma.mapping.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { capabilityId: { in: ['cap-1', 'cap-2', 'cap-3'] } },
        }),
      );
    });
  });

  // ── analyseForChangeRequest ───────────────────────────────────────────────

  describe('analyseForChangeRequest', () => {
    it('delegates to analyse() with the CR capabilityIds and type', async () => {
      mockPrismaService.changeRequest.findUnique.mockResolvedValue({
        affectedCapabilityIds: ['cap-1', 'cap-2'],
        type: ChangeRequestType.RETIRE,
      });
      mockPrismaService.mapping.findMany.mockResolvedValue([
        makeMapping({ state: MappingState.ACTIVE }),
      ]);

      const result = await service.analyseForChangeRequest('cr-id-1');

      expect(prisma.changeRequest.findUnique).toHaveBeenCalledWith({
        where: { id: 'cr-id-1' },
        select: { affectedCapabilityIds: true, type: true },
      });
      expect(result.summary.severity).toBe(ImpactSeverity.HIGH);
    });

    it('returns an empty result when the change request is not found', async () => {
      mockPrismaService.changeRequest.findUnique.mockResolvedValue(null);

      const result = await service.analyseForChangeRequest('non-existent-cr');

      expect(result.impactedMappings).toHaveLength(0);
      expect(result.summary.severity).toBe(ImpactSeverity.LOW);
    });
  });
});
