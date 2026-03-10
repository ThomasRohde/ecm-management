/**
 * AuditService unit tests
 *
 * Verifies:
 * 1. record() writes exactly one AuditEntry with the supplied params.
 * 2. AuditEntry rows are never mutated (immutability – no update/delete calls).
 * 3. query() applies all supported filters and returns paginated results.
 * 4. query() uses defaults (limit=50, offset=0) when omitted.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { AuditAction, AuditEntityType } from '@prisma/client';
import { AuditService } from '../audit.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockAuditEntry = {
  id: 'audit-1',
  entityType: AuditEntityType.CHANGE_REQUEST,
  entityId: 'cr-1',
  action: AuditAction.SUBMIT,
  actorId: 'user-1',
  before: null,
  after: null,
  metadata: null,
  timestamp: new Date(),
};

const mockPrisma = {
  auditEntry: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(), // should never be called
    delete: jest.fn(), // should never be called
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  // ── record() ───────────────────────────────────────────────────────────────

  describe('record()', () => {
    it('creates exactly one AuditEntry with the supplied params', async () => {
      mockPrisma.auditEntry.create.mockResolvedValue(mockAuditEntry);

      await service.record({
        entityType: AuditEntityType.CHANGE_REQUEST,
        entityId: 'cr-1',
        action: AuditAction.SUBMIT,
        actorId: 'user-1',
        metadata: { changeRequestId: 'cr-1' },
      });

      expect(mockPrisma.auditEntry.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: AuditEntityType.CHANGE_REQUEST,
            entityId: 'cr-1',
            action: AuditAction.SUBMIT,
            actorId: 'user-1',
          }),
        }),
      );
    });

    it('records a DELETE action for capability deletion', async () => {
      mockPrisma.auditEntry.create.mockResolvedValue(mockAuditEntry);

      await service.record({
        entityType: AuditEntityType.CAPABILITY,
        entityId: 'cap-1',
        action: AuditAction.DELETE,
        actorId: 'system',
      });

      expect(mockPrisma.auditEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: AuditAction.DELETE,
            entityType: AuditEntityType.CAPABILITY,
          }),
        }),
      );
    });

    it('never calls update or delete on audit entries (immutability)', async () => {
      mockPrisma.auditEntry.create.mockResolvedValue(mockAuditEntry);

      await service.record({
        entityType: AuditEntityType.MODEL_VERSION,
        entityId: 'mv-1',
        action: AuditAction.PUBLISH,
        actorId: 'user-2',
      });

      expect(mockPrisma.auditEntry.update).not.toHaveBeenCalled();
      expect(mockPrisma.auditEntry.delete).not.toHaveBeenCalled();
    });
  });

  // ── query() ───────────────────────────────────────────────────────────────

  describe('query()', () => {
    beforeEach(() => {
      mockPrisma.auditEntry.findMany.mockResolvedValue([mockAuditEntry]);
      mockPrisma.auditEntry.count.mockResolvedValue(1);
    });

    it('returns items and total', async () => {
      const result = await service.query({});

      expect(result).toEqual({ items: [mockAuditEntry], total: 1 });
    });

    it('uses default limit=50 and offset=0 when not supplied', async () => {
      await service.query({});

      expect(mockPrisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 }),
      );
    });

    it('forwards entityType filter to Prisma', async () => {
      await service.query({ entityType: AuditEntityType.MAPPING });

      expect(mockPrisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: AuditEntityType.MAPPING,
          }),
        }),
      );
    });

    it('forwards entityId, actorId, and action filters', async () => {
      await service.query({
        entityId: 'cap-99',
        actorId: 'user-x',
        action: AuditAction.UPDATE,
      });

      expect(mockPrisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityId: 'cap-99',
            actorId: 'user-x',
            action: AuditAction.UPDATE,
          }),
        }),
      );
    });

    it('builds timestamp range filter when fromDate and toDate are supplied', async () => {
      const from = '2025-01-01T00:00:00.000Z';
      const to = '2025-12-31T23:59:59.999Z';

      await service.query({ fromDate: from, toDate: to });

      expect(mockPrisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: {
              gte: new Date(from),
              lte: new Date(to),
            },
          }),
        }),
      );
    });

    it('orders results by timestamp descending', async () => {
      await service.query({});

      expect(mockPrisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { timestamp: 'desc' } }),
      );
    });

    it('respects custom limit and offset', async () => {
      await service.query({ limit: 10, offset: 20 });

      expect(mockPrisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      );
    });
  });
});
