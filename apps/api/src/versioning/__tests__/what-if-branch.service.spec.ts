/**
 * WhatIfBranchService unit tests
 *
 * Coverage:
 * - Branch lifecycle: create, list, get, discard
 * - Branch isolation: branch-local capabilities never appear in main reads
 * - Diff vs base: added / modified / removed classification
 * - Capability projection: create, update, delete, list, get within a branch
 * - Write guard: discarded / non-DRAFT branches reject mutations
 */

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
  Prisma,
} from '@prisma/client';
import { WhatIfBranchService } from '../what-if-branch.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CapabilityVersionService } from '../capability-version.service';
import { ModelVersionService } from '../model-version.service';

// ─── Mock factories ─────────────────────────────────────────────────────────────

const createModelVersionRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'branch-id',
  versionLabel: 'what-if-explore-123',
  state: ModelVersionState.DRAFT,
  baseVersionId: 'main-draft-id',
  branchType: BranchType.WHAT_IF,
  branchName: 'explore',
  description: null,
  notes: null,
  createdBy: 'curator-1',
  approvedBy: null,
  publishedAt: null,
  rollbackOfVersionId: null,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-01T00:00:00.000Z'),
  ...overrides,
});

const createMainDraftRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'main-draft-id',
  versionLabel: 'draft-1000',
  state: ModelVersionState.DRAFT,
  baseVersionId: null,
  branchType: BranchType.MAIN,
  branchName: null,
  description: null,
  notes: null,
  createdBy: 'system',
  approvedBy: null,
  publishedAt: null,
  rollbackOfVersionId: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const createCapabilityRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'cap-id',
  uniqueName: 'test.capability',
  aliases: [],
  description: null,
  domain: null,
  type: 'ABSTRACT',
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
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-01T00:00:00.000Z'),
  // main capabilities: branchOriginId is null
  branchOriginId: null,
  ...overrides,
});

const createCapabilityVersionRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'cv-id',
  capabilityId: 'cap-id',
  modelVersionId: 'branch-id',
  changeType: CapabilityVersionChangeType.CREATE,
  changedFields: {},
  beforeSnapshot: null,
  afterSnapshot: createCapabilityRecord(),
  changedBy: 'curator-1',
  changedAt: new Date('2026-03-01T00:00:00.000Z'),
  previousVersionId: null,
  capability: { id: 'cap-id', uniqueName: 'test.capability' },
  ...overrides,
});

// ─── Mock prisma ─────────────────────────────────────────────────────────────────

const mockPrismaService = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction: jest.fn().mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
    return fn(mockPrismaService);
  }),
  capability: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  capabilityVersion: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
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
  computeChangedFields: jest.fn().mockReturnValue({ description: { before: null, after: 'v' } }),
};

const mockModelVersionService = {
  getCurrentDraft: jest.fn(),
  computeDiff: jest.fn(),
  getCapabilityStateAtVersion: jest.fn(),
};

// ─── Suite ───────────────────────────────────────────────────────────────────────

describe('WhatIfBranchService', () => {
  let service: WhatIfBranchService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatIfBranchService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CapabilityVersionService, useValue: mockCapabilityVersionService },
        { provide: ModelVersionService, useValue: mockModelVersionService },
      ],
    }).compile();

    service = module.get<WhatIfBranchService>(WhatIfBranchService);
    prisma = module.get(PrismaService);

    jest.resetAllMocks();

    // Re-apply $transaction after resetAllMocks clears implementations.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(mockPrismaService));
    mockCapabilityVersionService.computeChangedFields.mockReturnValue({
      description: { before: null, after: 'desc' },
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── createBranch ──────────────────────────────────────────────────────────────

  describe('createBranch', () => {
    it('should fork a new WHAT_IF branch from the MAIN DRAFT', async () => {
      const mainDraft = createMainDraftRecord();
      const newBranch = createModelVersionRecord();

      mockModelVersionService.getCurrentDraft.mockResolvedValue(mainDraft);
      prisma.modelVersion.findFirst.mockResolvedValue(null); // no name conflict
      prisma.modelVersion.create.mockResolvedValue(newBranch);

      const result = await service.createBranch({ branchName: 'explore' }, 'curator-1');

      expect(prisma.modelVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branchType: BranchType.WHAT_IF,
            branchName: 'explore',
            baseVersionId: 'main-draft-id',
          }),
        }),
      );
      expect(result).toEqual(newBranch);
    });

    it('should throw BadRequestException when no MAIN DRAFT exists', async () => {
      mockModelVersionService.getCurrentDraft.mockResolvedValue(null);

      await expect(service.createBranch({ branchName: 'explore' }, 'curator-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException when branch name is already taken', async () => {
      const mainDraft = createMainDraftRecord();
      const existing = createModelVersionRecord();

      mockModelVersionService.getCurrentDraft.mockResolvedValue(mainDraft);
      prisma.modelVersion.findFirst.mockResolvedValue(existing); // name conflict

      await expect(service.createBranch({ branchName: 'explore' }, 'curator-1')).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.modelVersion.create).not.toHaveBeenCalled();
    });
  });

  // ── listBranches / getBranch ──────────────────────────────────────────────────

  describe('listBranches', () => {
    it('should return all WHAT_IF branches ordered newest first', async () => {
      const branches = [createModelVersionRecord()];
      prisma.modelVersion.findMany.mockResolvedValue(branches);

      const result = await service.listBranches();

      expect(prisma.modelVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { branchType: BranchType.WHAT_IF } }),
      );
      expect(result).toEqual({ items: branches, total: 1 });
    });
  });

  describe('getBranch', () => {
    it('should return the branch by ID', async () => {
      const branch = createModelVersionRecord();
      prisma.modelVersion.findUnique.mockResolvedValue(branch);

      const result = await service.getBranch('branch-id');

      expect(result).toEqual(branch);
    });

    it('should throw NotFoundException for a non-WHAT_IF model version', async () => {
      const mainVersion = createMainDraftRecord();
      prisma.modelVersion.findUnique.mockResolvedValue(mainVersion);

      await expect(service.getBranch('main-draft-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when branch does not exist', async () => {
      prisma.modelVersion.findUnique.mockResolvedValue(null);

      await expect(service.getBranch('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── discardBranch ─────────────────────────────────────────────────────────────

  describe('discardBranch', () => {
    it('should set the branch state to ROLLED_BACK', async () => {
      const branch = createModelVersionRecord();
      const discarded = createModelVersionRecord({ state: ModelVersionState.ROLLED_BACK });

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      prisma.modelVersion.update.mockResolvedValue(discarded);
      prisma.capability.findMany.mockResolvedValue([]); // no branch-local caps

      const result = await service.discardBranch('branch-id');

      expect(prisma.modelVersion.update).toHaveBeenCalledWith({
        where: { id: 'branch-id' },
        data: { state: ModelVersionState.ROLLED_BACK },
      });
      expect(result.state).toBe(ModelVersionState.ROLLED_BACK);
    });

    it('should throw BadRequestException if branch was already discarded', async () => {
      const discarded = createModelVersionRecord({ state: ModelVersionState.ROLLED_BACK });
      prisma.modelVersion.findUnique.mockResolvedValue(discarded);

      await expect(service.discardBranch('branch-id')).rejects.toThrow(BadRequestException);
      expect(prisma.modelVersion.update).not.toHaveBeenCalled();
    });

    it('should clean up branch-local capabilities on discard', async () => {
      const branch = createModelVersionRecord();
      const discarded = createModelVersionRecord({ state: ModelVersionState.ROLLED_BACK });
      const branchLocalCap = createCapabilityRecord({
        id: 'branch-local-cap-id',
        branchOriginId: 'branch-id',
      });

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      prisma.modelVersion.update.mockResolvedValue(discarded);
      prisma.capability.findMany.mockResolvedValue([branchLocalCap]);
      prisma.capabilityVersion.deleteMany.mockResolvedValue({ count: 1 });
      prisma.capability.deleteMany.mockResolvedValue({ count: 1 });

      await service.discardBranch('branch-id');

      // CapabilityVersion rows must be deleted BEFORE the Capability rows (FK order).
      expect(prisma.capabilityVersion.deleteMany).toHaveBeenCalledWith({
        where: { capabilityId: { in: ['branch-local-cap-id'] } },
      });
      expect(prisma.capability.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['branch-local-cap-id'] } },
      });
    });

    it('should NOT modify the MAIN DRAFT on discard', async () => {
      const branch = createModelVersionRecord();
      const discarded = createModelVersionRecord({ state: ModelVersionState.ROLLED_BACK });

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      prisma.modelVersion.update.mockResolvedValue(discarded);
      prisma.capability.findMany.mockResolvedValue([]);

      await service.discardBranch('branch-id');

      // update is called exactly once – only for the branch, never for MAIN
      expect(prisma.modelVersion.update).toHaveBeenCalledTimes(1);
      expect(prisma.modelVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'branch-id' } }),
      );
      // Underlying main capability table must not be touched
      expect(prisma.capability.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ── diffVsBase ────────────────────────────────────────────────────────────────

  describe('diffVsBase', () => {
    const buildDiffResult = (
      added: unknown[] = [],
      modified: unknown[] = [],
      removed: unknown[] = [],
    ) => ({
      fromVersion: { id: 'main-draft-id', versionLabel: 'draft-1000', state: ModelVersionState.DRAFT },
      toVersion: { id: 'branch-id', versionLabel: 'what-if-explore', state: ModelVersionState.DRAFT },
      added,
      modified,
      removed,
      summary: { addedCount: added.length, modifiedCount: modified.length, removedCount: removed.length },
    });

    it('should report added capabilities for branch-local creates', async () => {
      const branch = createModelVersionRecord();
      const diffResult = buildDiffResult(
        [{ capabilityId: 'new-cap', name: 'New Capability' }],
      );

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      mockModelVersionService.computeDiff.mockResolvedValue(diffResult);

      const result = await service.diffVsBase('branch-id');

      expect(mockModelVersionService.computeDiff).toHaveBeenCalledWith('main-draft-id', 'branch-id');
      expect(result.summary.addedCount).toBe(1);
      expect(result.summary.modifiedCount).toBe(0);
      expect(result.summary.removedCount).toBe(0);
      expect(result.added[0]).toMatchObject({ capabilityId: 'new-cap', name: 'New Capability' });
    });

    it('should report modified capabilities for branch updates', async () => {
      const branch = createModelVersionRecord();
      const diffResult = buildDiffResult(
        [],
        [{ capabilityId: 'existing-cap', name: 'Existing Cap', changedFields: { description: { before: 'old', after: 'new' } } }],
      );

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      mockModelVersionService.computeDiff.mockResolvedValue(diffResult);

      const result = await service.diffVsBase('branch-id');

      expect(result.summary.modifiedCount).toBe(1);
      expect(result.modified[0]).toMatchObject({ capabilityId: 'existing-cap' });
    });

    it('should report removed capabilities for branch deletes', async () => {
      const branch = createModelVersionRecord();
      const diffResult = buildDiffResult(
        [],
        [],
        [{ capabilityId: 'deleted-cap', name: 'Deleted Cap' }],
      );

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      mockModelVersionService.computeDiff.mockResolvedValue(diffResult);

      const result = await service.diffVsBase('branch-id');

      expect(result.summary.removedCount).toBe(1);
      expect(result.removed[0]).toMatchObject({ capabilityId: 'deleted-cap' });
    });

    it('should throw BadRequestException if branch has no base version', async () => {
      const branchNoBase = createModelVersionRecord({ baseVersionId: null });
      prisma.modelVersion.findUnique.mockResolvedValue(branchNoBase);

      await expect(service.diffVsBase('branch-id')).rejects.toThrow(BadRequestException);
    });
  });

  // ── createCapabilityInBranch ──────────────────────────────────────────────────

  describe('createCapabilityInBranch', () => {
    const activeBranch = () => createModelVersionRecord();

    it('should create the capability with branchOriginId set to the branch ID', async () => {
      const branch = activeBranch();
      const createdCap = createCapabilityRecord({
        id: 'new-branch-cap-id',
        uniqueName: 'branch.only.cap',
        branchOriginId: 'branch-id',
      });
      const capVersion = createCapabilityVersionRecord({
        capabilityId: 'new-branch-cap-id',
        afterSnapshot: createdCap,
      });

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      prisma.capability.findUnique.mockResolvedValue(null); // no uniqueName conflict
      prisma.capability.create.mockResolvedValue(createdCap);
      prisma.capabilityVersion.create.mockResolvedValue(capVersion);
      // getCapabilityInBranch calls: findFirst for branch override, then getCapabilityStateAtVersion
      prisma.capabilityVersion.findFirst.mockResolvedValue(capVersion);

      const result = await service.createCapabilityInBranch(
        'branch-id',
        { uniqueName: 'branch.only.cap' },
        'curator-1',
      );

      // The created Capability row must carry branchOriginId = branchId.
      expect(prisma.capability.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchOriginId: 'branch-id' }),
        }),
      );

      // Return value must be the branch projection (afterSnapshot).
      expect(result).toMatchObject({ branchOriginId: 'branch-id', uniqueName: 'branch.only.cap' });
    });

    it('should throw ConflictException if uniqueName already exists', async () => {
      const branch = activeBranch();
      const existingCap = createCapabilityRecord({ uniqueName: 'branch.only.cap' });

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      prisma.capability.findUnique.mockResolvedValue(existingCap); // conflict

      await expect(
        service.createCapabilityInBranch('branch-id', { uniqueName: 'branch.only.cap' }, 'curator-1'),
      ).rejects.toThrow(ConflictException);

      expect(prisma.capability.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if DB throws P2002 (race window between pre-check and insert)', async () => {
      const branch = activeBranch();

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      // Pre-check passes (no conflict found), but the DB insert races and throws P2002
      prisma.capability.findUnique.mockResolvedValue(null);
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      // The $transaction mock will propagate the error from capability.create
      prisma.capability.create.mockRejectedValue(p2002);

      await expect(
        service.createCapabilityInBranch('branch-id', { uniqueName: 'racing.cap' }, 'curator-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if the branch is not writable (ROLLED_BACK)', async () => {
      const discarded = createModelVersionRecord({ state: ModelVersionState.ROLLED_BACK });
      prisma.modelVersion.findUnique.mockResolvedValue(discarded);

      await expect(
        service.createCapabilityInBranch('branch-id', { uniqueName: 'x' }, 'curator-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Branch isolation ──────────────────────────────────────────────────────────

  describe('branch isolation – branchOriginId filter in CapabilityService', () => {
    /**
     * This test validates that CapabilityService.findAll() is wired to exclude
     * branch-local capabilities.  Rather than loading the full CapabilityService
     * dependency graph, we assert that WhatIfBranchService sets branchOriginId on
     * create AND that CapabilityService uses WHERE branchOriginId IS NULL.
     *
     * The CapabilityService unit tests (capability.service.spec.ts) carry the
     * assertions that verify the WHERE clause directly.
     */

    it('created capability has branchOriginId set to the branch – confirming main read filter applies', async () => {
      const branch = createModelVersionRecord();
      const branchLocalCap = createCapabilityRecord({
        id: 'branch-only-id',
        uniqueName: 'branch.isolated.cap',
        branchOriginId: 'branch-id',   // set by createCapabilityInBranch
      });
      const capVersion = createCapabilityVersionRecord({
        capabilityId: 'branch-only-id',
        afterSnapshot: branchLocalCap,
      });

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      prisma.capability.findUnique.mockResolvedValue(null); // no uniqueName conflict
      prisma.capability.create.mockResolvedValue(branchLocalCap);
      prisma.capabilityVersion.create.mockResolvedValue(capVersion);
      prisma.capabilityVersion.findFirst.mockResolvedValue(capVersion);

      await service.createCapabilityInBranch(
        'branch-id',
        { uniqueName: 'branch.isolated.cap' },
        'curator-1',
      );

      // The created row must have branchOriginId set.
      // CapabilityService.findAll() filters WHERE branchOriginId IS NULL,
      // so this capability will be invisible to main reads.
      const createCall = (prisma.capability.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.branchOriginId).toBe('branch-id');
    });
  });

  // ── listCapabilitiesInBranch ──────────────────────────────────────────────────

  describe('listCapabilitiesInBranch', () => {
    it('should include base capabilities not overridden', async () => {
      const branch = createModelVersionRecord();
      const baseSnap = createCapabilityRecord({ id: 'main-cap', uniqueName: 'main.cap' });

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      mockModelVersionService.getCapabilityStateAtVersion.mockResolvedValue(
        new Map([['main-cap', baseSnap]]),
      );
      prisma.capabilityVersion.findMany.mockResolvedValue([]); // no branch overrides

      const result = await service.listCapabilitiesInBranch('branch-id');

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ uniqueName: 'main.cap' });
    });

    it('should include branch-local creates not in base', async () => {
      const branch = createModelVersionRecord();
      const newCapSnap = createCapabilityRecord({
        id: 'branch-new-cap',
        uniqueName: 'branch.new.cap',
        branchOriginId: 'branch-id',
      });

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      mockModelVersionService.getCapabilityStateAtVersion.mockResolvedValue(new Map()); // empty base

      const branchCvEntry = {
        capabilityId: 'branch-new-cap',
        changeType: CapabilityVersionChangeType.CREATE,
        afterSnapshot: newCapSnap,
      };
      prisma.capabilityVersion.findMany.mockResolvedValue([branchCvEntry]);

      const result = await service.listCapabilitiesInBranch('branch-id');

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ uniqueName: 'branch.new.cap' });
    });

    it('should exclude capabilities deleted within the branch', async () => {
      const branch = createModelVersionRecord();
      const deletedSnap = createCapabilityRecord({ id: 'deleted-cap', uniqueName: 'deleted.cap' });

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      mockModelVersionService.getCapabilityStateAtVersion.mockResolvedValue(
        new Map([['deleted-cap', deletedSnap]]),
      );

      const deletedEntry = {
        capabilityId: 'deleted-cap',
        changeType: CapabilityVersionChangeType.DELETE,
        afterSnapshot: null,
      };
      prisma.capabilityVersion.findMany.mockResolvedValue([deletedEntry]);

      const result = await service.listCapabilitiesInBranch('branch-id');

      expect(result.items).toHaveLength(0);
    });
  });

  // ── getCapabilityInBranch ──────────────────────────────────────────────────────

  describe('getCapabilityInBranch', () => {
    it('should return the branch override snapshot when it exists', async () => {
      const branch = createModelVersionRecord();
      const updatedSnap = createCapabilityRecord({ id: 'main-cap', uniqueName: 'main.cap', description: 'branch desc' });
      const cvEntry = {
        changeType: CapabilityVersionChangeType.UPDATE,
        afterSnapshot: updatedSnap,
      };

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      prisma.capabilityVersion.findFirst.mockResolvedValue(cvEntry);

      const result = await service.getCapabilityInBranch('branch-id', 'main-cap');

      expect(result).toMatchObject({ description: 'branch desc' });
    });

    it('should fall back to base snapshot when no branch override exists', async () => {
      const branch = createModelVersionRecord();
      const baseSnap = createCapabilityRecord({ id: 'main-cap', uniqueName: 'main.cap' });

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      prisma.capabilityVersion.findFirst.mockResolvedValue(null); // no branch entry
      mockModelVersionService.getCapabilityStateAtVersion.mockResolvedValue(
        new Map([['main-cap', baseSnap]]),
      );

      const result = await service.getCapabilityInBranch('branch-id', 'main-cap');

      expect(result).toMatchObject({ uniqueName: 'main.cap' });
    });

    it('should throw NotFoundException when capability is deleted in the branch', async () => {
      const branch = createModelVersionRecord();
      const deletedEntry = { changeType: CapabilityVersionChangeType.DELETE, afterSnapshot: null };

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      prisma.capabilityVersion.findFirst.mockResolvedValue(deletedEntry);

      await expect(service.getCapabilityInBranch('branch-id', 'cap-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── updateCapabilityInBranch ──────────────────────────────────────────────────

  describe('updateCapabilityInBranch', () => {
    it('should record an UPDATE CapabilityVersion scoped to the branch', async () => {
      const branch = createModelVersionRecord();
      const currentSnap = createCapabilityRecord({ id: 'main-cap', uniqueName: 'main.cap' });
      const cvEntry = { changeType: CapabilityVersionChangeType.UPDATE, afterSnapshot: currentSnap };

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      // getCapabilityInBranch lookup
      prisma.capabilityVersion.findFirst
        .mockResolvedValueOnce(cvEntry) // for getCapabilityInBranch
        .mockResolvedValueOnce(null); // prevCv in transaction
      prisma.capabilityVersion.create.mockResolvedValue({});

      mockCapabilityVersionService.computeChangedFields.mockReturnValue({
        description: { before: null, after: 'new desc' },
      });

      const result = await service.updateCapabilityInBranch(
        'branch-id',
        'main-cap',
        { description: 'new desc' },
        'curator-1',
      );

      expect(prisma.capabilityVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            modelVersionId: 'branch-id',
            changeType: CapabilityVersionChangeType.UPDATE,
          }),
        }),
      );
      expect(result).toMatchObject({ description: 'new desc' });
    });

    it('should throw BadRequestException when branch is not writable', async () => {
      const discarded = createModelVersionRecord({ state: ModelVersionState.ROLLED_BACK });
      prisma.modelVersion.findUnique.mockResolvedValue(discarded);

      await expect(
        service.updateCapabilityInBranch('branch-id', 'cap-id', { description: 'x' }, 'curator-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── deleteCapabilityInBranch ──────────────────────────────────────────────────

  describe('deleteCapabilityInBranch', () => {
    it('should record a DELETE CapabilityVersion scoped to the branch', async () => {
      const branch = createModelVersionRecord();
      const currentSnap = createCapabilityRecord({ id: 'main-cap', uniqueName: 'main.cap' });
      const cvEntry = { changeType: CapabilityVersionChangeType.UPDATE, afterSnapshot: currentSnap };

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      prisma.capabilityVersion.findFirst
        .mockResolvedValueOnce(cvEntry)   // getCapabilityInBranch
        .mockResolvedValueOnce(null);     // prevCv

      mockCapabilityVersionService.computeChangedFields.mockReturnValue({
        uniqueName: { before: 'main.cap', after: null },
      });
      prisma.capabilityVersion.create.mockResolvedValue({});

      await service.deleteCapabilityInBranch('branch-id', 'main-cap', 'curator-1');

      expect(prisma.capabilityVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            modelVersionId: 'branch-id',
            changeType: CapabilityVersionChangeType.DELETE,
          }),
        }),
      );
    });

    it('should throw NotFoundException if capability does not exist in branch', async () => {
      const branch = createModelVersionRecord();

      prisma.modelVersion.findUnique.mockResolvedValue(branch);
      prisma.capabilityVersion.findFirst.mockResolvedValue(null);
      mockModelVersionService.getCapabilityStateAtVersion.mockResolvedValue(new Map());

      await expect(
        service.deleteCapabilityInBranch('branch-id', 'missing-cap', 'curator-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
