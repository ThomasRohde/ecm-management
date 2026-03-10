/**
 * Unit tests for StructuralOpsService
 *
 * All Prisma calls are mocked — no real database required.
 * Tests cover happy-path and validation-error cases for each structural
 * operation: REPARENT, PROMOTE, DEMOTE, MERGE, RETIRE, DELETE.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CapabilityType, LifecycleStatus, MappingState } from '@prisma/client';
import { StructuralOpsService } from '../structural-ops.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainEventBus } from '../events/capability-domain-events';
import { CapabilityVersionService } from '../../versioning/capability-version.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

// Tx client is the same mock object in these tests (single-layer mock)
const mockTx = {
  capability: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  capabilityVersion: {
    deleteMany: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  },
  modelVersion: {
    findFirst: jest.fn().mockResolvedValue({ id: 'draft-version-id' }),
    create: jest.fn().mockResolvedValue({ id: 'draft-version-id' }),
  },
  capabilityLock: {
    deleteMany: jest.fn(),
  },
  mapping: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockPrismaService = {
  $transaction: jest.fn(),
  capability: mockTx.capability,
  mapping: mockTx.mapping,
};

const mockDomainEventBus = {
  emitCapabilityReparented: jest.fn(),
  emitCapabilityPromoted: jest.fn(),
  emitCapabilityDemoted: jest.fn(),
  emitCapabilityMerged: jest.fn(),
  emitCapabilityRetired: jest.fn(),
  emitCapabilityDeleted: jest.fn(),
};

const mockCapabilityVersionService = {
  recordChange: jest.fn().mockResolvedValue(undefined),
  recordChangeDirect: jest.fn().mockResolvedValue(undefined),
  getHistory: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 25, totalPages: 0, capabilityId: '' }),
  ensureDraftVersionId: jest.fn().mockResolvedValue('draft-version-id'),
  computeChangedFields: jest.fn().mockReturnValue({}),
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CR_ID = 'cr-aaaaaaaa-0000-0000-0000-000000000000';
const CAP_ID = 'cap-bbbbbbbb-0000-0000-0000-000000000000';
const PARENT_ID = 'cap-cccccccc-0000-0000-0000-000000000000';
const SURVIVOR_ID = 'cap-dddddddd-0000-0000-0000-000000000000';
const SOURCE_ID = 'cap-eeeeeeee-0000-0000-0000-000000000000';
const ACTOR = 'actor-1';

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('StructuralOpsService', () => {
  let service: StructuralOpsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StructuralOpsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: DomainEventBus, useValue: mockDomainEventBus },
        { provide: CapabilityVersionService, useValue: mockCapabilityVersionService },
      ],
    }).compile();

    service = module.get<StructuralOpsService>(StructuralOpsService);
  });

  // ── REPARENT ─────────────────────────────────────────────────────────────────

  describe('applyReparent', () => {
    it('moves capability to new parent', async () => {
      mockTx.capability.findUnique
        .mockResolvedValueOnce({ id: CAP_ID, parentId: null }) // capability lookup
        .mockResolvedValueOnce({ id: PARENT_ID })              // parent existence
        .mockResolvedValueOnce({ parentId: null });             // ancestor walk (parent has no parent)
      mockTx.capability.update.mockResolvedValueOnce({});

      const result = await service.applyReparent(
        CR_ID,
        CAP_ID,
        { newParentId: PARENT_ID },
        ACTOR,
        mockTx as any,
      );

      expect(result.type).toBe('REPARENT');
      expect(result.payload.newParentId).toBe(PARENT_ID);
      expect(result.payload.oldParentId).toBeNull();
      expect(mockTx.capability.update).toHaveBeenCalledWith({
        where: { id: CAP_ID },
        data: { parentId: PARENT_ID },
      });
    });

    it('moves capability to root when newParentId is null', async () => {
      mockTx.capability.findUnique
        .mockResolvedValueOnce({ id: CAP_ID, parentId: PARENT_ID });
      mockTx.capability.update.mockResolvedValueOnce({});

      const result = await service.applyReparent(
        CR_ID,
        CAP_ID,
        { newParentId: null },
        ACTOR,
        mockTx as any,
      );

      expect(result.payload.newParentId).toBeNull();
      expect(result.payload.oldParentId).toBe(PARENT_ID);
    });

    it('treats absent operationPayload as newParentId = null (move to root)', async () => {
      mockTx.capability.findUnique
        .mockResolvedValueOnce({ id: CAP_ID, parentId: PARENT_ID });
      mockTx.capability.update.mockResolvedValueOnce({});

      const result = await service.applyReparent(CR_ID, CAP_ID, null, ACTOR, mockTx as any);
      expect(result.payload.newParentId).toBeNull();
    });

    it('throws NotFoundException when capability does not exist', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.applyReparent(CR_ID, CAP_ID, {}, ACTOR, mockTx as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when target parent does not exist', async () => {
      mockTx.capability.findUnique
        .mockResolvedValueOnce({ id: CAP_ID, parentId: null }) // capability
        .mockResolvedValueOnce(null);                           // parent not found

      await expect(
        service.applyReparent(CR_ID, CAP_ID, { newParentId: PARENT_ID }, ACTOR, mockTx as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when newParentId equals capabilityId (self-parent)', async () => {
      mockTx.capability.findUnique
        .mockResolvedValueOnce({ id: CAP_ID, parentId: null });

      await expect(
        service.applyReparent(CR_ID, CAP_ID, { newParentId: CAP_ID }, ACTOR, mockTx as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when newParentId is a descendant (circular ref)', async () => {
      // Ancestor walk: newParentId → CAP_ID → null (newParentId is descendant of CAP_ID)
      mockTx.capability.findUnique
        .mockResolvedValueOnce({ id: CAP_ID, parentId: null })  // capability
        .mockResolvedValueOnce({ id: PARENT_ID })               // parent exists
        .mockResolvedValueOnce({ parentId: CAP_ID });           // newParentId's parent is CAP_ID → circular

      await expect(
        service.applyReparent(CR_ID, CAP_ID, { newParentId: PARENT_ID }, ACTOR, mockTx as any),
      ).rejects.toThrow(/circular/i);
    });
  });

  // ── PROMOTE ──────────────────────────────────────────────────────────────────

  describe('applyPromote', () => {
    it('promotes a LEAF capability to ABSTRACT', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({ id: CAP_ID, type: CapabilityType.LEAF });
      mockTx.capability.update.mockResolvedValueOnce({});

      const result = await service.applyPromote(CR_ID, CAP_ID, ACTOR, mockTx as any);

      expect(result.type).toBe('PROMOTE');
      expect(mockTx.capability.update).toHaveBeenCalledWith({
        where: { id: CAP_ID },
        data: { type: CapabilityType.ABSTRACT },
      });
    });

    it('throws NotFoundException when capability does not exist', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce(null);
      await expect(service.applyPromote(CR_ID, CAP_ID, ACTOR, mockTx as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when capability is already ABSTRACT', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({ id: CAP_ID, type: CapabilityType.ABSTRACT });
      await expect(service.applyPromote(CR_ID, CAP_ID, ACTOR, mockTx as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── DEMOTE ───────────────────────────────────────────────────────────────────

  describe('applyDemote', () => {
    it('demotes an ABSTRACT capability with no children to LEAF', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({ id: CAP_ID, type: CapabilityType.ABSTRACT });
      mockTx.capability.count.mockResolvedValueOnce(0);
      mockTx.capability.update.mockResolvedValueOnce({});

      const result = await service.applyDemote(CR_ID, CAP_ID, ACTOR, mockTx as any);

      expect(result.type).toBe('DEMOTE');
      expect(mockTx.capability.update).toHaveBeenCalledWith({
        where: { id: CAP_ID },
        data: { type: CapabilityType.LEAF },
      });
    });

    it('throws NotFoundException when capability does not exist', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce(null);
      await expect(service.applyDemote(CR_ID, CAP_ID, ACTOR, mockTx as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when capability is already LEAF', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({ id: CAP_ID, type: CapabilityType.LEAF });
      await expect(service.applyDemote(CR_ID, CAP_ID, ACTOR, mockTx as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when capability has children', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({ id: CAP_ID, type: CapabilityType.ABSTRACT });
      mockTx.capability.count.mockResolvedValueOnce(3);

      await expect(service.applyDemote(CR_ID, CAP_ID, ACTOR, mockTx as any)).rejects.toThrow(
        /children/i,
      );
    });
  });

  // ── MERGE ─────────────────────────────────────────────────────────────────────

  describe('applyMerge', () => {
    const buildSurvivor = () => ({
      id: SURVIVOR_ID,
      lifecycleStatus: LifecycleStatus.ACTIVE,
      aliases: ['alias-a'],
      tags: ['tag-1'],
      sourceReferences: ['ref-1'],
    });

    const buildSource = () => ({
      id: SOURCE_ID,
      lifecycleStatus: LifecycleStatus.ACTIVE,
      aliases: ['alias-b'],
      tags: ['tag-2'],
      sourceReferences: ['ref-2'],
    });

    it('merges source into survivor: transfers children, mappings, metadata, retires source', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce(buildSurvivor());
      mockTx.capability.findMany.mockResolvedValueOnce([buildSource()]);
      // assertNotDescendant walks survivor's ancestor chain — survivor has no parent → stops immediately
      mockTx.capability.findUnique.mockResolvedValueOnce({ parentId: null });
      mockTx.capability.updateMany
        .mockResolvedValueOnce({ count: 2 }) // re-parent children
        .mockResolvedValueOnce({ count: 0 }); // retire source (we use update below)
      mockTx.mapping.updateMany.mockResolvedValueOnce({ count: 3 }); // transfer mappings
      mockTx.capability.update
        .mockResolvedValueOnce({}) // retire source
        .mockResolvedValueOnce({}); // update survivor metadata

      const result = await service.applyMerge(
        CR_ID,
        [SURVIVOR_ID, SOURCE_ID],
        { survivorCapabilityId: SURVIVOR_ID },
        ACTOR,
        mockTx as any,
      );

      expect(result.type).toBe('MERGE');
      expect(result.payload.survivorCapabilityId).toBe(SURVIVOR_ID);
      expect(result.payload.retiredSourceIds).toEqual([SOURCE_ID]);
      expect(result.payload.transferredChildCount).toBe(2);
      expect(result.payload.transferredMappingCount).toBe(3);

      // Source was retired
      expect(mockTx.capability.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SOURCE_ID },
          data: expect.objectContaining({ lifecycleStatus: LifecycleStatus.RETIRED }),
        }),
      );

      // Survivor metadata was merged (aliases deduped)
      expect(mockTx.capability.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SURVIVOR_ID },
          data: expect.objectContaining({
            aliases: expect.arrayContaining(['alias-a', 'alias-b']),
          }),
        }),
      );
    });

    it('throws BadRequestException when survivorCapabilityId is missing', async () => {
      await expect(
        service.applyMerge(CR_ID, [SURVIVOR_ID, SOURCE_ID], null, ACTOR, mockTx as any),
      ).rejects.toThrow(/survivorCapabilityId/);
    });

    it('throws BadRequestException when no source is distinct from survivor', async () => {
      await expect(
        service.applyMerge(CR_ID, [SURVIVOR_ID], { survivorCapabilityId: SURVIVOR_ID }, ACTOR, mockTx as any),
      ).rejects.toThrow(/source capability/i);
    });

    it('throws NotFoundException when survivor does not exist', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.applyMerge(
          CR_ID,
          [SURVIVOR_ID, SOURCE_ID],
          { survivorCapabilityId: SURVIVOR_ID },
          ACTOR,
          mockTx as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when survivor is already RETIRED', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({
        ...buildSurvivor(),
        lifecycleStatus: LifecycleStatus.RETIRED,
      });

      await expect(
        service.applyMerge(
          CR_ID,
          [SURVIVOR_ID, SOURCE_ID],
          { survivorCapabilityId: SURVIVOR_ID },
          ACTOR,
          mockTx as any,
        ),
      ).rejects.toThrow(/RETIRED/);
    });

    it('throws NotFoundException when a source capability does not exist', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce(buildSurvivor());
      mockTx.capability.findMany.mockResolvedValueOnce([]); // no sources found

      await expect(
        service.applyMerge(
          CR_ID,
          [SURVIVOR_ID, SOURCE_ID],
          { survivorCapabilityId: SURVIVOR_ID },
          ACTOR,
          mockTx as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when survivor is a descendant of a source capability', async () => {
      // Survivor's parent chain: SURVIVOR_ID → SOURCE_ID (survivor is child of source)
      // Merging: re-parenting SOURCE_ID's children to SURVIVOR_ID would make SURVIVOR_ID its own ancestor
      mockTx.capability.findUnique.mockResolvedValueOnce(buildSurvivor());
      mockTx.capability.findMany.mockResolvedValueOnce([buildSource()]);
      // assertNotDescendant walks from SURVIVOR_ID upward and finds SOURCE_ID
      mockTx.capability.findUnique.mockResolvedValueOnce({ parentId: SOURCE_ID }); // survivor's parent IS source
      // assertNotDescendant will throw before the next findUnique call

      await expect(
        service.applyMerge(
          CR_ID,
          [SURVIVOR_ID, SOURCE_ID],
          { survivorCapabilityId: SURVIVOR_ID },
          ACTOR,
          mockTx as any,
        ),
      ).rejects.toThrow(/circular/i);
    });
  });

  // ── RETIRE ───────────────────────────────────────────────────────────────────

  describe('applyRetire', () => {
    it('retires capabilities and flags active mappings', async () => {
      mockTx.capability.findMany.mockResolvedValueOnce([
        { id: CAP_ID, lifecycleStatus: LifecycleStatus.ACTIVE },
      ]);
      mockTx.capability.count.mockResolvedValueOnce(0); // no children
      mockTx.capability.updateMany.mockResolvedValueOnce({ count: 1 });
      mockTx.mapping.findMany.mockResolvedValueOnce([{ id: 'mapping-1' }, { id: 'mapping-2' }]);
      mockTx.mapping.updateMany.mockResolvedValueOnce({ count: 2 });

      const result = await service.applyRetire(
        CR_ID,
        [CAP_ID],
        { effectiveTo: '2026-12-31T00:00:00.000Z' },
        ACTOR,
        mockTx as any,
      );

      expect(result.type).toBe('RETIRE');
      expect(result.payload.retiredCapabilityIds).toEqual([CAP_ID]);
      expect(result.payload.flaggedMappingIds).toEqual(['mapping-1', 'mapping-2']);
      expect(result.payload.effectiveTo).toEqual(new Date('2026-12-31T00:00:00.000Z'));

      expect(mockTx.mapping.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['mapping-1', 'mapping-2'] } },
        data: { state: MappingState.INACTIVE },
      });
    });

    it('uses current timestamp for effectiveTo when not provided', async () => {
      mockTx.capability.findMany.mockResolvedValueOnce([
        { id: CAP_ID, lifecycleStatus: LifecycleStatus.ACTIVE },
      ]);
      mockTx.capability.count.mockResolvedValueOnce(0); // no children
      mockTx.capability.updateMany.mockResolvedValueOnce({ count: 1 });
      mockTx.mapping.findMany.mockResolvedValueOnce([]);

      const before = new Date();
      const result = await service.applyRetire(CR_ID, [CAP_ID], null, ACTOR, mockTx as any);
      const after = new Date();

      expect(result.payload.effectiveTo.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.payload.effectiveTo.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('throws NotFoundException when capability does not exist', async () => {
      mockTx.capability.findMany.mockResolvedValueOnce([]); // none found

      await expect(
        service.applyRetire(CR_ID, [CAP_ID], null, ACTOR, mockTx as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when capability is already RETIRED', async () => {
      mockTx.capability.findMany.mockResolvedValueOnce([
        { id: CAP_ID, lifecycleStatus: LifecycleStatus.RETIRED },
      ]);

      await expect(
        service.applyRetire(CR_ID, [CAP_ID], null, ACTOR, mockTx as any),
      ).rejects.toThrow(/RETIRED/);
    });

    it('throws BadRequestException when a capability being retired has children', async () => {
      mockTx.capability.findMany.mockResolvedValueOnce([
        { id: CAP_ID, lifecycleStatus: LifecycleStatus.ACTIVE },
      ]);
      mockTx.capability.count.mockResolvedValueOnce(2); // has children

      await expect(
        service.applyRetire(CR_ID, [CAP_ID], null, ACTOR, mockTx as any),
      ).rejects.toThrow(/children/i);
    });

    it('throws BadRequestException when effectiveTo is an invalid date string', async () => {
      mockTx.capability.findMany.mockResolvedValueOnce([
        { id: CAP_ID, lifecycleStatus: LifecycleStatus.ACTIVE },
      ]);

      await expect(
        service.applyRetire(CR_ID, [CAP_ID], { effectiveTo: 'not-a-date' }, ACTOR, mockTx as any),
      ).rejects.toThrow(/effectiveTo/);
    });
  });

  // ── DELETE ───────────────────────────────────────────────────────────────────

  describe('applyDelete', () => {
    it('hard-deletes a DRAFT capability with no children', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({
        id: CAP_ID,
        lifecycleStatus: LifecycleStatus.DRAFT,
        isErroneous: false,
      });
      mockTx.capability.count.mockResolvedValueOnce(0);
      mockTx.capabilityVersion.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockTx.capabilityLock.deleteMany.mockResolvedValueOnce({ count: 1 });
      mockTx.mapping.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockTx.capability.delete.mockResolvedValueOnce({});

      const result = await service.applyDelete(CR_ID, [CAP_ID], ACTOR, mockTx as any);

      expect(result.type).toBe('DELETE');
      expect(result.payload.capabilityId).toBe(CAP_ID);
      expect(mockTx.capabilityVersion.deleteMany).toHaveBeenCalledWith({ where: { capabilityId: CAP_ID } });
      expect(mockTx.capabilityLock.deleteMany).toHaveBeenCalledWith({ where: { capabilityId: CAP_ID } });
      expect(mockTx.capability.delete).toHaveBeenCalledWith({ where: { id: CAP_ID } });
    });

    it('hard-deletes an ACTIVE capability flagged as erroneous with no children', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({
        id: CAP_ID,
        lifecycleStatus: LifecycleStatus.ACTIVE,
        isErroneous: true,
      });
      mockTx.capability.count.mockResolvedValueOnce(0);
      mockTx.capabilityVersion.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockTx.capabilityLock.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockTx.mapping.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockTx.capability.delete.mockResolvedValueOnce({});

      const result = await service.applyDelete(CR_ID, [CAP_ID], ACTOR, mockTx as any);

      expect(result.type).toBe('DELETE');
      expect(result.payload.capabilityId).toBe(CAP_ID);
      expect(mockTx.capability.delete).toHaveBeenCalledWith({ where: { id: CAP_ID } });
    });

    it('hard-deletes a DEPRECATED capability flagged as erroneous with no children', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({
        id: CAP_ID,
        lifecycleStatus: LifecycleStatus.DEPRECATED,
        isErroneous: true,
      });
      mockTx.capability.count.mockResolvedValueOnce(0);
      mockTx.capabilityVersion.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockTx.capabilityLock.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockTx.mapping.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockTx.capability.delete.mockResolvedValueOnce({});

      const result = await service.applyDelete(CR_ID, [CAP_ID], ACTOR, mockTx as any);

      expect(result.type).toBe('DELETE');
      expect(result.payload.capabilityId).toBe(CAP_ID);
      expect(mockTx.capability.delete).toHaveBeenCalledWith({ where: { id: CAP_ID } });
    });

    it('hard-deletes a RETIRED capability flagged as erroneous with no children', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({
        id: CAP_ID,
        lifecycleStatus: LifecycleStatus.RETIRED,
        isErroneous: true,
      });
      mockTx.capability.count.mockResolvedValueOnce(0);
      mockTx.capabilityVersion.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockTx.capabilityLock.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockTx.mapping.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockTx.capability.delete.mockResolvedValueOnce({});

      const result = await service.applyDelete(CR_ID, [CAP_ID], ACTOR, mockTx as any);

      expect(result.type).toBe('DELETE');
      expect(result.payload.capabilityId).toBe(CAP_ID);
      expect(mockTx.capability.delete).toHaveBeenCalledWith({ where: { id: CAP_ID } });
    });

    it('throws BadRequestException when affectedCapabilityIds has more than one element', async () => {
      await expect(
        service.applyDelete(CR_ID, [CAP_ID, PARENT_ID], ACTOR, mockTx as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when capability does not exist', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce(null);

      await expect(service.applyDelete(CR_ID, [CAP_ID], ACTOR, mockTx as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when capability is ACTIVE and not erroneous', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({
        id: CAP_ID,
        lifecycleStatus: LifecycleStatus.ACTIVE,
        isErroneous: false,
      });

      await expect(service.applyDelete(CR_ID, [CAP_ID], ACTOR, mockTx as any)).rejects.toThrow(
        /erroneous/i,
      );
    });

    it('throws BadRequestException when capability is not DRAFT and isErroneous is absent (falsy)', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({
        id: CAP_ID,
        lifecycleStatus: LifecycleStatus.DEPRECATED,
        isErroneous: false,
      });

      await expect(service.applyDelete(CR_ID, [CAP_ID], ACTOR, mockTx as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when erroneous capability has children', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({
        id: CAP_ID,
        lifecycleStatus: LifecycleStatus.ACTIVE,
        isErroneous: true,
      });
      mockTx.capability.count.mockResolvedValueOnce(1);

      await expect(service.applyDelete(CR_ID, [CAP_ID], ACTOR, mockTx as any)).rejects.toThrow(
        /children/i,
      );
    });

    it('throws BadRequestException when capability has children', async () => {
      mockTx.capability.findUnique.mockResolvedValueOnce({
        id: CAP_ID,
        lifecycleStatus: LifecycleStatus.DRAFT,
        isErroneous: false,
      });
      mockTx.capability.count.mockResolvedValueOnce(2);

      await expect(service.applyDelete(CR_ID, [CAP_ID], ACTOR, mockTx as any)).rejects.toThrow(
        /children/i,
      );
    });
  });

  // ── parsePayload edge cases ──────────────────────────────────────────────────
  // parsePayload is private — exercised through applyReparent which calls it first.

  describe('parsePayload (via applyReparent)', () => {
    it('throws BadRequestException when operationPayload is an array (not a JSON object)', async () => {
      // parsePayload is called before the capability lookup, so no mock needed
      await expect(
        service.applyReparent(CR_ID, CAP_ID, [1, 2, 3] as unknown as null, ACTOR, mockTx as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when operationPayload is a primitive string', async () => {
      await expect(
        service.applyReparent(CR_ID, CAP_ID, 'not-an-object' as unknown as null, ACTOR, mockTx as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── assertNotDescendant edge cases ───────────────────────────────────────────

  describe('assertNotDescendant (via applyReparent)', () => {
    it('throws BadRequestException when the hierarchy has a pre-existing cycle (visited set triggered)', async () => {
      // Data model has PARENT_ID → CYCLE_ID → PARENT_ID (cycle not involving CAP_ID)
      // Walk: start at PARENT_ID → visits CYCLE_ID → re-encounters PARENT_ID → throws
      const CYCLE_ID = 'cap-ffffffff-0000-0000-0000-000000000099';

      mockTx.capability.findUnique
        .mockResolvedValueOnce({ id: CAP_ID, parentId: null })   // capability lookup
        .mockResolvedValueOnce({ id: PARENT_ID })                 // parent exists
        // assertNotDescendant walk: start at PARENT_ID
        .mockResolvedValueOnce({ parentId: CYCLE_ID })            // PARENT_ID's parent
        .mockResolvedValueOnce({ parentId: PARENT_ID });          // CYCLE_ID's parent → PARENT_ID revisited → cycle

      await expect(
        service.applyReparent(CR_ID, CAP_ID, { newParentId: PARENT_ID }, ACTOR, mockTx as any),
      ).rejects.toThrow(/circular/i);
    });
  });

  // ── MERGE – multi-source ──────────────────────────────────────────────────────

  describe('applyMerge – additional edge cases', () => {
    const SOURCE_ID_2 = 'cap-ffffffff-0000-0000-0000-000000000002';

    beforeEach(() => {
      // Some prior tests leave unconsumed Once values on findMany (e.g. the
      // effectiveTo-invalid retire test throws before reaching findMany).
      // The original "merges source" test leaves a spurious capability.updateMany
      // Once value too.  jest.clearAllMocks() clears tracking but NOT the Once
      // queue, so we drain both here to keep tests isolated.
      mockTx.capability.findMany.mockReset();
      mockTx.capability.updateMany.mockReset();
    });

    it('merges multiple sources: accumulates child/mapping counts and dedupes metadata', async () => {
      const survivor = {
        id: SURVIVOR_ID,
        lifecycleStatus: LifecycleStatus.ACTIVE,
        aliases: ['alias-a'],
        tags: ['tag-1'],
        sourceReferences: ['ref-1'],
      };
      const source1 = {
        id: SOURCE_ID,
        lifecycleStatus: LifecycleStatus.ACTIVE,
        aliases: ['alias-b'],
        tags: ['tag-2'],
        sourceReferences: ['ref-2'],
      };
      const source2 = {
        id: SOURCE_ID_2,
        lifecycleStatus: LifecycleStatus.ACTIVE,
        aliases: ['alias-a'], // duplicate of survivor — should be deduped
        tags: ['tag-3'],
        sourceReferences: ['ref-3'],
      };

      mockTx.capability.findUnique.mockResolvedValueOnce(survivor);
      mockTx.capability.findMany.mockResolvedValueOnce([source1, source2]);

      // assertNotDescendant(source1.id, survivorId): walk from SURVIVOR_ID — no parent → stops
      mockTx.capability.findUnique.mockResolvedValueOnce({ parentId: null });
      // assertNotDescendant(source2.id, survivorId): same
      mockTx.capability.findUnique.mockResolvedValueOnce({ parentId: null });

      // source1 loop: re-parent children, transfer mappings, retire
      mockTx.capability.updateMany.mockResolvedValueOnce({ count: 1 });  // re-parent source1 children
      mockTx.mapping.updateMany.mockResolvedValueOnce({ count: 2 });     // transfer source1 mappings
      mockTx.capability.update.mockResolvedValueOnce({});                 // retire source1

      // source2 loop: re-parent children, transfer mappings, retire
      mockTx.capability.updateMany.mockResolvedValueOnce({ count: 0 });  // re-parent source2 children
      mockTx.mapping.updateMany.mockResolvedValueOnce({ count: 1 });     // transfer source2 mappings
      mockTx.capability.update.mockResolvedValueOnce({});                 // retire source2

      // Update survivor metadata
      mockTx.capability.update.mockResolvedValueOnce({});

      const result = await service.applyMerge(
        CR_ID,
        [SURVIVOR_ID, SOURCE_ID, SOURCE_ID_2],
        { survivorCapabilityId: SURVIVOR_ID },
        ACTOR,
        mockTx as any,
      );

      expect(result.type).toBe('MERGE');
      expect(result.payload.retiredSourceIds).toEqual([SOURCE_ID, SOURCE_ID_2]);
      expect(result.payload.transferredChildCount).toBe(1);    // 1 + 0
      expect(result.payload.transferredMappingCount).toBe(3);  // 2 + 1

      // Survivor metadata update: alias-a should appear only once (deduped)
      const survivorUpdateCall = mockTx.capability.update.mock.calls.find(
        (call: unknown[]) => (call[0] as any)?.where?.id === SURVIVOR_ID,
      );
      expect(survivorUpdateCall).toBeDefined();
      const aliases: string[] = (survivorUpdateCall![0] as any).data.aliases;
      expect(aliases).toEqual(expect.arrayContaining(['alias-a', 'alias-b']));
      expect(aliases.filter((a: string) => a === 'alias-a')).toHaveLength(1);
    });
  });

  // ── RETIRE – additional edge cases ───────────────────────────────────────────

  describe('applyRetire – additional edge cases', () => {
    beforeEach(() => {
      // Drain any leftover Once values on findMany (see comment in MERGE block above).
      mockTx.capability.findMany.mockReset();
    });

    it('does NOT call mapping.updateMany when there are no active mappings', async () => {
      mockTx.capability.findMany.mockResolvedValueOnce([
        { id: CAP_ID, lifecycleStatus: LifecycleStatus.ACTIVE },
      ]);
      mockTx.capability.count.mockResolvedValueOnce(0);
      mockTx.capability.updateMany.mockResolvedValueOnce({ count: 1 });
      // No active mappings
      mockTx.mapping.findMany.mockResolvedValueOnce([]);

      const result = await service.applyRetire(CR_ID, [CAP_ID], null, ACTOR, mockTx as any);

      expect(result.payload.flaggedMappingIds).toEqual([]);
      expect(mockTx.mapping.updateMany).not.toHaveBeenCalled();
    });

    it('retires multiple capabilities and flags their active mappings', async () => {
      const CAP_ID_2 = 'cap-bbbbbbbb-0000-0000-0000-000000000002';

      mockTx.capability.findMany.mockResolvedValueOnce([
        { id: CAP_ID, lifecycleStatus: LifecycleStatus.ACTIVE },
        { id: CAP_ID_2, lifecycleStatus: LifecycleStatus.ACTIVE },
      ]);
      mockTx.capability.count.mockResolvedValueOnce(0); // no children across both
      mockTx.capability.updateMany.mockResolvedValueOnce({ count: 2 });
      mockTx.mapping.findMany.mockResolvedValueOnce([{ id: 'm-1' }, { id: 'm-2' }, { id: 'm-3' }]);
      mockTx.mapping.updateMany.mockResolvedValueOnce({ count: 3 });

      const result = await service.applyRetire(
        CR_ID,
        [CAP_ID, CAP_ID_2],
        null,
        ACTOR,
        mockTx as any,
      );

      expect(result.payload.retiredCapabilityIds).toEqual([CAP_ID, CAP_ID_2]);
      expect(result.payload.flaggedMappingIds).toHaveLength(3);
      expect(mockTx.capability.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [CAP_ID, CAP_ID_2] } },
          data: expect.objectContaining({ lifecycleStatus: LifecycleStatus.RETIRED }),
        }),
      );
    });
  });

  // ── emitDomainEvent ──────────────────────────────────────────────────────────

  describe('emitDomainEvent', () => {
    const basePayload = { changeRequestId: CR_ID, actorId: ACTOR, occurredAt: new Date() };

    it('routes REPARENT result to emitCapabilityReparented', () => {
      const payload = { capabilityId: CAP_ID, oldParentId: null, newParentId: PARENT_ID, ...basePayload };
      service.emitDomainEvent({ type: 'REPARENT', payload });
      expect(mockDomainEventBus.emitCapabilityReparented).toHaveBeenCalledWith(payload);
    });

    it('routes PROMOTE result to emitCapabilityPromoted', () => {
      const payload = { capabilityId: CAP_ID, ...basePayload };
      service.emitDomainEvent({ type: 'PROMOTE', payload });
      expect(mockDomainEventBus.emitCapabilityPromoted).toHaveBeenCalledWith(payload);
    });

    it('routes DEMOTE result to emitCapabilityDemoted', () => {
      const payload = { capabilityId: CAP_ID, ...basePayload };
      service.emitDomainEvent({ type: 'DEMOTE', payload });
      expect(mockDomainEventBus.emitCapabilityDemoted).toHaveBeenCalledWith(payload);
    });

    it('routes MERGE result to emitCapabilityMerged', () => {
      const payload = {
        survivorCapabilityId: SURVIVOR_ID,
        retiredSourceIds: [SOURCE_ID],
        transferredChildCount: 0,
        transferredMappingCount: 0,
        ...basePayload,
      };
      service.emitDomainEvent({ type: 'MERGE', payload });
      expect(mockDomainEventBus.emitCapabilityMerged).toHaveBeenCalledWith(payload);
    });

    it('routes RETIRE result to emitCapabilityRetired', () => {
      const payload = {
        retiredCapabilityIds: [CAP_ID],
        flaggedMappingIds: [],
        effectiveTo: new Date(),
        ...basePayload,
      };
      service.emitDomainEvent({ type: 'RETIRE', payload });
      expect(mockDomainEventBus.emitCapabilityRetired).toHaveBeenCalledWith(payload);
    });

    it('routes DELETE result to emitCapabilityDeleted', () => {
      const payload = { capabilityId: CAP_ID, ...basePayload };
      service.emitDomainEvent({ type: 'DELETE', payload });
      expect(mockDomainEventBus.emitCapabilityDeleted).toHaveBeenCalledWith(payload);
    });
  });
});
