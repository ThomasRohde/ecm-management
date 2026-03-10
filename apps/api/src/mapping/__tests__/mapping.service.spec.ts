import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MappingService } from '../mapping.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { MappingState } from '../dto/create-mapping.dto';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const mockPrismaService = {
  // $transaction used by findAll for [findMany, count] tuple form.
  $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
  mapping: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  capability: {
    findUnique: jest.fn(),
  },
};

const createMappingRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'mapping-id-1',
  mappingType: 'CONSUMES',
  systemId: 'system-abc',
  capabilityId: 'capability-id-1',
  state: MappingState.ACTIVE,
  attributes: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  capability: {
    id: 'capability-id-1',
    uniqueName: 'Order Management',
    lifecycleStatus: 'ACTIVE',
  },
  ...overrides,
});

const createCapabilityRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'capability-id-1',
  lifecycleStatus: 'ACTIVE',
  ...overrides,
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAuditService = {
  record: jest.fn().mockResolvedValue(undefined),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MappingService', () => {
  let service: MappingService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MappingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<MappingService>(MappingService);
    prisma = module.get(PrismaService);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns a paginated list with defaults when no params given', async () => {
      const record = createMappingRecord();
      prisma.mapping.findMany.mockResolvedValue([record]);
      prisma.mapping.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(prisma.mapping.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 25 }),
      );
      expect(result).toEqual({
        items: [record],
        total: 1,
        page: 1,
        limit: 25,
        totalPages: 1,
      });
    });

    it('passes state/systemId/capabilityId/mappingType filters to the query', async () => {
      prisma.mapping.findMany.mockResolvedValue([]);
      prisma.mapping.count.mockResolvedValue(0);

      await service.findAll({
        state: MappingState.INACTIVE,
        systemId: 'sys-1',
        capabilityId: 'cap-1',
        mappingType: 'READS',
        page: 2,
        limit: 10,
      });

      expect(prisma.mapping.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            state: MappingState.INACTIVE,
            systemId: 'sys-1',
            capabilityId: 'cap-1',
            mappingType: 'READS',
          },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('computes totalPages correctly for non-round totals', async () => {
      prisma.mapping.findMany.mockResolvedValue([]);
      prisma.mapping.count.mockResolvedValue(11);

      const result = await service.findAll({ limit: 5 });

      expect(result.totalPages).toBe(3);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the mapping when it exists', async () => {
      const record = createMappingRecord();
      prisma.mapping.findUnique.mockResolvedValue(record);

      const result = await service.findOne('mapping-id-1');

      expect(result).toEqual(record);
      expect(prisma.mapping.findUnique).toHaveBeenCalledWith({
        where: { id: 'mapping-id-1' },
        include: { capability: true },
      });
    });

    it('throws NotFoundException when the mapping does not exist', async () => {
      prisma.mapping.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findByCapability ───────────────────────────────────────────────────────

  describe('findByCapability', () => {
    it('returns all mappings for a capability', async () => {
      const capId = 'capability-id-1';
      prisma.capability.findUnique.mockResolvedValue({ id: capId });
      const records = [createMappingRecord(), createMappingRecord({ id: 'mapping-id-2' })];
      prisma.mapping.findMany.mockResolvedValue(records);

      const result = await service.findByCapability(capId);

      expect(prisma.mapping.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { capabilityId: capId } }),
      );
      expect(result).toHaveLength(2);
    });

    it('throws NotFoundException when capability does not exist', async () => {
      prisma.capability.findUnique.mockResolvedValue(null);

      await expect(service.findByCapability('no-such-cap')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findBySystem ───────────────────────────────────────────────────────────

  describe('findBySystem', () => {
    it('returns all mappings for a system', async () => {
      const records = [createMappingRecord()];
      prisma.mapping.findMany.mockResolvedValue(records);

      const result = await service.findBySystem('system-abc');

      expect(prisma.mapping.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { systemId: 'system-abc' } }),
      );
      expect(result).toEqual(records);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a mapping with default ACTIVE state when state is omitted', async () => {
      const cap = createCapabilityRecord();
      const record = createMappingRecord();
      prisma.capability.findUnique.mockResolvedValue(cap);
      prisma.mapping.create.mockResolvedValue(record);

      const result = await service.create({
        mappingType: 'CONSUMES',
        systemId: 'system-abc',
        capabilityId: 'capability-id-1',
      });

      expect(prisma.mapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: MappingState.ACTIVE }),
        }),
      );
      expect(result).toEqual(record);
    });

    it('creates a mapping with an explicit PENDING state', async () => {
      const cap = createCapabilityRecord();
      const record = createMappingRecord({ state: MappingState.PENDING });
      prisma.capability.findUnique.mockResolvedValue(cap);
      prisma.mapping.create.mockResolvedValue(record);

      await service.create({
        mappingType: 'PRODUCES',
        systemId: 'sys-2',
        capabilityId: 'capability-id-1',
        state: MappingState.PENDING,
      });

      expect(prisma.mapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: MappingState.PENDING }),
        }),
      );
    });

    it('throws NotFoundException when capability does not exist', async () => {
      prisma.capability.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ mappingType: 'CONSUMES', systemId: 'sys', capabilityId: 'no-such-cap' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when capability is RETIRED', async () => {
      prisma.capability.findUnique.mockResolvedValue(
        createCapabilityRecord({ lifecycleStatus: 'RETIRED' }),
      );

      await expect(
        service.create({
          mappingType: 'CONSUMES',
          systemId: 'sys',
          capabilityId: 'capability-id-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates only provided fields', async () => {
      const record = createMappingRecord();
      const updated = { ...record, state: MappingState.INACTIVE };
      prisma.mapping.update.mockResolvedValue(updated);

      const result = await service.update('mapping-id-1', { state: MappingState.INACTIVE });

      expect(prisma.mapping.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mapping-id-1' },
          data: { state: MappingState.INACTIVE },
        }),
      );
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when Prisma returns P2025', async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '6.0.0',
      });
      prisma.mapping.update.mockRejectedValue(p2025);

      await expect(
        service.update('no-such-mapping', { state: MappingState.INACTIVE }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when no fields are provided', async () => {
      await expect(service.update('mapping-id-1', {})).rejects.toThrow(BadRequestException);
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes the mapping when it exists', async () => {
      prisma.mapping.delete.mockResolvedValue(createMappingRecord());

      await expect(service.delete('mapping-id-1')).resolves.toBeUndefined();

      expect(prisma.mapping.delete).toHaveBeenCalledWith({ where: { id: 'mapping-id-1' } });
    });

    it('throws NotFoundException when Prisma returns P2025', async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '6.0.0',
      });
      prisma.mapping.delete.mockRejectedValue(p2025);

      await expect(service.delete('no-such-mapping')).rejects.toThrow(NotFoundException);
    });
  });
});
