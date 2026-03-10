import { Test, type TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalDecisionOutcome,
  ChangeRequestStatus,
  ChangeRequestType,
} from '@prisma/client';
import {
  ChangeRequestService,
  CURATOR_ROLE,
  GOVERNANCE_BOARD_ROLE,
} from '../change-request.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ChangeRequestNotFoundException } from '../exceptions/change-request-not-found.exception';
import { InvalidStateTransitionException } from '../exceptions/invalid-state-transition.exception';
import { CapabilityLockedException } from '../exceptions/capability-locked.exception';
import { InsufficientApprovalRoleException } from '../exceptions/insufficient-approval-role.exception';
import { StructuralOpsService } from '../../structural-ops/structural-ops.service';
import { ImpactAnalysisService, ImpactSeverity } from '../../impact-analysis/impact-analysis.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notification/notification.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const mockTransaction = jest.fn();

const mockPrismaService = {
  changeRequest: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  changeRequestAuditEntry: {
    create: jest.fn(),
  },
  approvalDecision: {
    create: jest.fn(),
  },
  capabilityLock: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: mockTransaction,
};

const mockStructuralOpsService = {
  applyReparent: jest.fn(),
  applyPromote: jest.fn(),
  applyDemote: jest.fn(),
  applyMerge: jest.fn(),
  applyRetire: jest.fn(),
  applyDelete: jest.fn(),
  emitDomainEvent: jest.fn(),
};

const mockAuditService = {
  record: jest.fn().mockResolvedValue(undefined),
};

const mockNotificationService = {
  create: jest.fn().mockResolvedValue(undefined),
};

const emptyImpact = {
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
};

const mockImpactAnalysisService = {
  analyse: jest.fn().mockResolvedValue(emptyImpact),
  analyseForChangeRequest: jest.fn().mockResolvedValue(emptyImpact),
};

function makeCr(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof buildCr> {
  return buildCr(overrides);
}

function buildCr(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cr-id-1',
    type: ChangeRequestType.UPDATE,
    status: ChangeRequestStatus.DRAFT,
    requestedBy: 'user-1',
    rationale: 'Needed for Q1 restructure',
    affectedCapabilityIds: ['cap-1', 'cap-2'],
    impactSummary: null,
    downstreamPlan: null,
    approvals: null,
    operationPayload: null,
    executionLog: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    approvalDecisions: [],
    auditEntries: [],
    capabilityLocks: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChangeRequestService', () => {
  let service: ChangeRequestService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default transaction: run callback with same mock tx
    mockTransaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
      cb(mockPrismaService),
    );

    // Default impact analysis returns no mappings (safe for most tests)
    mockImpactAnalysisService.analyse.mockResolvedValue(emptyImpact);
    mockImpactAnalysisService.analyseForChangeRequest.mockResolvedValue(emptyImpact);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChangeRequestService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StructuralOpsService, useValue: mockStructuralOpsService },
        { provide: ImpactAnalysisService, useValue: mockImpactAnalysisService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<ChangeRequestService>(ChangeRequestService);
    prisma = module.get(PrismaService);
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a DRAFT change request and appends an audit entry', async () => {
      const cr = makeCr();
      prisma.changeRequest.create.mockResolvedValue(cr);
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});
      prisma.changeRequest.findUnique.mockResolvedValue(cr);

      const result = await service.create(
        {
          type: ChangeRequestType.UPDATE,
          rationale: 'Needed for Q1 restructure',
          affectedCapabilityIds: ['cap-1', 'cap-2'],
        },
        'user-1',
      );

      expect(prisma.changeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ChangeRequestStatus.DRAFT,
            requestedBy: 'user-1',
          }),
        }),
      );
      expect(prisma.changeRequestAuditEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'CREATED' }),
        }),
      );
      expect(result).toBeDefined();
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns a change request when it exists', async () => {
      const cr = makeCr();
      prisma.changeRequest.findUnique.mockResolvedValue(cr);

      const result = await service.findOne('cr-id-1');
      expect(result.id).toBe('cr-id-1');
    });

    it('throws ChangeRequestNotFoundException when not found', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        ChangeRequestNotFoundException,
      );
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns items and total without filters', async () => {
      const cr = makeCr();
      prisma.changeRequest.findMany.mockResolvedValue([cr]);
      prisma.changeRequest.count.mockResolvedValue(1);

      const result = await service.findAll({});
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('applies status, type and requestedBy filters', async () => {
      prisma.changeRequest.findMany.mockResolvedValue([]);
      prisma.changeRequest.count.mockResolvedValue(0);

      await service.findAll({
        status: ChangeRequestStatus.APPROVED,
        type: ChangeRequestType.CREATE,
        requestedBy: 'alice',
      });

      const whereArg = prisma.changeRequest.findMany.mock.calls[0][0].where;
      expect(whereArg.status).toBe(ChangeRequestStatus.APPROVED);
      expect(whereArg.type).toBe(ChangeRequestType.CREATE);
      expect(whereArg.requestedBy).toBe('alice');
    });
  });

  // ── findActiveByCapabilityId ──────────────────────────────────────────────

  describe('findActiveByCapabilityId', () => {
    it('queries with has and status in filter', async () => {
      const cr = makeCr();
      prisma.changeRequest.findMany.mockResolvedValue([cr]);

      const result = await service.findActiveByCapabilityId('cap-1');

      const whereArg = prisma.changeRequest.findMany.mock.calls[0][0].where;
      expect(whereArg.affectedCapabilityIds).toEqual({ has: 'cap-1' });
      expect(whereArg.status.in).toBeDefined();
      expect(result.total).toBe(1);
    });
  });

  // ── submit ────────────────────────────────────────────────────────────────

  describe('submit', () => {
    it('transitions DRAFT → SUBMITTED', async () => {
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.DRAFT }))
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.SUBMITTED }));
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});

      await service.submit('cr-id-1', 'user-1');

      expect(prisma.changeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ChangeRequestStatus.DRAFT }),
          data: { status: ChangeRequestStatus.SUBMITTED },
        }),
      );
    });

    it('rejects transition from COMPLETED (terminal)', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.COMPLETED }),
      );

      await expect(service.submit('cr-id-1', 'user-1')).rejects.toBeInstanceOf(
        InvalidStateTransitionException,
      );
    });

    it('rejects invalid transition from EXECUTING', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.EXECUTING }),
      );

      await expect(service.submit('cr-id-1', 'user-1')).rejects.toBeInstanceOf(
        InvalidStateTransitionException,
      );
    });
  });

  // ── requestApproval ───────────────────────────────────────────────────────

  describe('requestApproval', () => {
    it('transitions SUBMITTED → PENDING_APPROVAL', async () => {
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.SUBMITTED }))
        .mockResolvedValueOnce(
          makeCr({ status: ChangeRequestStatus.PENDING_APPROVAL }),
        );
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});
      mockImpactAnalysisService.analyse.mockResolvedValue(emptyImpact);

      await service.requestApproval('cr-id-1', 'user-1');

      expect(prisma.changeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ChangeRequestStatus.SUBMITTED }),
          data: { status: ChangeRequestStatus.PENDING_APPROVAL },
        }),
      );
    });

    it('rejects when status is not SUBMITTED', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.DRAFT }),
      );

      await expect(
        service.requestApproval('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(InvalidStateTransitionException);
    });

    // ── Impact analysis gate ─────────────────────────────────────────────────

    it('rejects RETIRE with active mappings when downstreamPlan is absent', async () => {
      const retireCr = makeCr({
        status: ChangeRequestStatus.SUBMITTED,
        type: ChangeRequestType.RETIRE,
        downstreamPlan: null,
      });
      prisma.changeRequest.findUnique.mockResolvedValue(retireCr);
      mockImpactAnalysisService.analyse.mockResolvedValue({
        ...emptyImpact,
        summary: {
          ...emptyImpact.summary,
          totalMappings: 2,
          activeMappings: 2,
          affectedSystemCount: 1,
          severity: ImpactSeverity.HIGH,
        },
      });

      await expect(
        service.requestApproval('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects RETIRE when downstreamPlan is whitespace-only (bypass guard)', async () => {
      const retireCr = makeCr({
        status: ChangeRequestStatus.SUBMITTED,
        type: ChangeRequestType.RETIRE,
        downstreamPlan: '   ', // whitespace-only — must be treated as absent
      });
      prisma.changeRequest.findUnique.mockResolvedValue(retireCr);
      mockImpactAnalysisService.analyse.mockResolvedValue({
        ...emptyImpact,
        summary: {
          ...emptyImpact.summary,
          activeMappings: 1,
          affectedSystemCount: 1,
          severity: ImpactSeverity.HIGH,
        },
      });

      await expect(
        service.requestApproval('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects MERGE with active mappings when downstreamPlan is absent', async () => {
      const mergeCr = makeCr({
        status: ChangeRequestStatus.SUBMITTED,
        type: ChangeRequestType.MERGE,
        downstreamPlan: null,
      });
      prisma.changeRequest.findUnique.mockResolvedValue(mergeCr);
      mockImpactAnalysisService.analyse.mockResolvedValue({
        ...emptyImpact,
        summary: {
          ...emptyImpact.summary,
          activeMappings: 1,
          affectedSystemCount: 1,
          severity: ImpactSeverity.HIGH,
        },
      });

      await expect(
        service.requestApproval('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows RETIRE with active mappings when downstreamPlan is provided', async () => {
      const retireCr = makeCr({
        status: ChangeRequestStatus.SUBMITTED,
        type: ChangeRequestType.RETIRE,
        downstreamPlan: 'Notify all consumers; migration guide at /docs/migrate',
      });
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(retireCr)
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.PENDING_APPROVAL }));
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.changeRequest.update.mockResolvedValue(retireCr);
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});
      mockImpactAnalysisService.analyse.mockResolvedValue({
        ...emptyImpact,
        summary: {
          ...emptyImpact.summary,
          activeMappings: 2,
          affectedSystemCount: 1,
          severity: ImpactSeverity.HIGH,
        },
      });

      await expect(service.requestApproval('cr-id-1', 'user-1')).resolves.toBeDefined();
    });

    it('allows RETIRE with no active mappings even without downstreamPlan', async () => {
      const retireCr = makeCr({
        status: ChangeRequestStatus.SUBMITTED,
        type: ChangeRequestType.RETIRE,
        downstreamPlan: null,
      });
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(retireCr)
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.PENDING_APPROVAL }));
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.changeRequest.update.mockResolvedValue(retireCr);
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});
      mockImpactAnalysisService.analyse.mockResolvedValue(emptyImpact);

      await expect(service.requestApproval('cr-id-1', 'user-1')).resolves.toBeDefined();
    });

    it('auto-populates impactSummary when it is null', async () => {
      const cr = makeCr({
        status: ChangeRequestStatus.SUBMITTED,
        type: ChangeRequestType.UPDATE,
        impactSummary: null,
      });
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(cr)
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.PENDING_APPROVAL }));
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.changeRequest.update.mockResolvedValue(cr);
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});
      mockImpactAnalysisService.analyse.mockResolvedValue({
        ...emptyImpact,
        summary: {
          ...emptyImpact.summary,
          totalMappings: 3,
          activeMappings: 2,
          affectedSystemCount: 2,
          severity: ImpactSeverity.MEDIUM,
        },
      });

      await service.requestApproval('cr-id-1', 'user-1');

      expect(prisma.changeRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cr-id-1' },
          data: expect.objectContaining({
            impactSummary: expect.stringContaining('severity:MEDIUM'),
          }),
        }),
      );
    });

    it('does not overwrite impactSummary when it is already set', async () => {
      const cr = makeCr({
        status: ChangeRequestStatus.SUBMITTED,
        type: ChangeRequestType.UPDATE,
        impactSummary: 'manually set summary',
      });
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(cr)
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.PENDING_APPROVAL }));
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});
      mockImpactAnalysisService.analyse.mockResolvedValue(emptyImpact);

      await service.requestApproval('cr-id-1', 'user-1');

      // update for impactSummary must NOT have been called
      expect(prisma.changeRequest.update).not.toHaveBeenCalled();
    });
  });

  // ── submitDecision ────────────────────────────────────────────────────────

  describe('submitDecision', () => {
    const pendingCr = () =>
      makeCr({ status: ChangeRequestStatus.PENDING_APPROVAL });

    it('allows curator to be first approver', async () => {
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(pendingCr())
        .mockResolvedValueOnce(pendingCr());
      prisma.approvalDecision.create.mockResolvedValue({});
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});

      await service.submitDecision(
        'cr-id-1',
        { decision: ApprovalDecisionOutcome.APPROVED },
        'curator-user',
        CURATOR_ROLE,
      );

      expect(prisma.approvalDecision.create).toHaveBeenCalled();
    });

    it('rejects governance-board before curator has decided', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(pendingCr());

      await expect(
        service.submitDecision(
          'cr-id-1',
          { decision: ApprovalDecisionOutcome.APPROVED },
          'gb-user',
          GOVERNANCE_BOARD_ROLE,
        ),
      ).rejects.toBeInstanceOf(InsufficientApprovalRoleException);
      await expect(
        service.submitDecision(
          'cr-id-1',
          { decision: ApprovalDecisionOutcome.APPROVED },
          'gb-user',
          GOVERNANCE_BOARD_ROLE,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('moves to APPROVED after governance-board approves (post-curator approval)', async () => {
      const curatorApproval = {
        approverRole: CURATOR_ROLE,
        decision: ApprovalDecisionOutcome.APPROVED,
      };
      const crWithCuratorDecision = makeCr({
        status: ChangeRequestStatus.PENDING_APPROVAL,
        approvalDecisions: [curatorApproval],
      });

      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(crWithCuratorDecision)
        .mockResolvedValueOnce(
          makeCr({ status: ChangeRequestStatus.APPROVED }),
        );
      prisma.approvalDecision.create.mockResolvedValue({});
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});

      await service.submitDecision(
        'cr-id-1',
        { decision: ApprovalDecisionOutcome.APPROVED },
        'gb-user',
        GOVERNANCE_BOARD_ROLE,
      );

      expect(prisma.changeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ChangeRequestStatus.APPROVED },
        }),
      );
    });

    it('moves to REJECTED when curator rejects', async () => {
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(pendingCr())
        .mockResolvedValueOnce(
          makeCr({ status: ChangeRequestStatus.REJECTED }),
        );
      prisma.approvalDecision.create.mockResolvedValue({});
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});

      await service.submitDecision(
        'cr-id-1',
        { decision: ApprovalDecisionOutcome.REJECTED, comment: 'Not enough detail' },
        'curator-user',
        CURATOR_ROLE,
      );

      expect(prisma.changeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ChangeRequestStatus.REJECTED },
        }),
      );
    });

    it('moves to REJECTED when governance-board rejects (after curator approved)', async () => {
      const curatorApproval = {
        approverRole: CURATOR_ROLE,
        decision: ApprovalDecisionOutcome.APPROVED,
      };
      const crWithCuratorApproval = makeCr({
        status: ChangeRequestStatus.PENDING_APPROVAL,
        approvalDecisions: [curatorApproval],
      });

      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(crWithCuratorApproval)
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.REJECTED }));
      prisma.approvalDecision.create.mockResolvedValue({});
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});

      await service.submitDecision(
        'cr-id-1',
        { decision: ApprovalDecisionOutcome.REJECTED, comment: 'Rejected by board' },
        'gb-user',
        GOVERNANCE_BOARD_ROLE,
      );

      expect(prisma.changeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ChangeRequestStatus.REJECTED },
        }),
      );
    });

    it('throws BadRequestException when curator already rejected (stale PENDING_APPROVAL state)', async () => {
      // CR is still PENDING_APPROVAL in the snapshot but curator decision is REJECTED.
      // This is a stale state guard — should surface as a clean 400.
      const crWithRejectedCurator = makeCr({
        status: ChangeRequestStatus.PENDING_APPROVAL,
        approvalDecisions: [
          {
            approverRole: CURATOR_ROLE,
            decision: ApprovalDecisionOutcome.REJECTED,
          },
        ],
      });
      prisma.changeRequest.findUnique.mockResolvedValue(crWithRejectedCurator);

      await expect(
        service.submitDecision(
          'cr-id-1',
          { decision: ApprovalDecisionOutcome.APPROVED },
          'gb-user',
          GOVERNANCE_BOARD_ROLE,
        ),
      ).rejects.toMatchObject({ message: 'Curator has already rejected this change request' });
    });

    it('throws InsufficientApprovalRoleException when curator approved but non-governance-board actor tries to act', async () => {
      const crWithCuratorApproval = makeCr({
        status: ChangeRequestStatus.PENDING_APPROVAL,
        approvalDecisions: [
          { approverRole: CURATOR_ROLE, decision: ApprovalDecisionOutcome.APPROVED },
        ],
      });
      prisma.changeRequest.findUnique.mockResolvedValue(crWithCuratorApproval);

      // Use a completely different role ('analyst') that:
      //   - has no prior decision (avoids the duplicate-check ConflictException), and
      //   - is not GOVERNANCE_BOARD_ROLE (triggers InsufficientApprovalRoleException).
      await expect(
        service.submitDecision(
          'cr-id-1',
          { decision: ApprovalDecisionOutcome.APPROVED },
          'analyst-user',
          'analyst',
        ),
      ).rejects.toBeInstanceOf(InsufficientApprovalRoleException);
    });

    it('throws BadRequestException when both approvals are already recorded (all-approvals-done guard)', async () => {
      // Both curator and governance-board have already decided.  A third actor
      // with a completely different role (not CURATOR_ROLE and not
      // GOVERNANCE_BOARD_ROLE) passes the duplicate-check but hits the
      // "All required approvals have already been submitted" BadRequestException.
      const crWithBothApprovals = makeCr({
        status: ChangeRequestStatus.PENDING_APPROVAL,
        approvalDecisions: [
          { approverRole: CURATOR_ROLE, decision: ApprovalDecisionOutcome.APPROVED },
          { approverRole: GOVERNANCE_BOARD_ROLE, decision: ApprovalDecisionOutcome.APPROVED },
        ],
      });
      prisma.changeRequest.findUnique.mockResolvedValue(crWithBothApprovals);

      await expect(
        service.submitDecision(
          'cr-id-1',
          { decision: ApprovalDecisionOutcome.APPROVED },
          'analyst-user',
          'analyst', // not CURATOR_ROLE, not GOVERNANCE_BOARD_ROLE → no duplicate hit → "all done" guard fires
        ),
      ).rejects.toMatchObject({
        message: 'All required approvals have already been submitted for this change request',
      });
    });

    it('rejects duplicate decision from same role', async () => {
      // Second curator attempt — CR already has a curator decision
      const crWithBothDecisions = makeCr({
        status: ChangeRequestStatus.PENDING_APPROVAL,
        approvalDecisions: [
          {
            approverRole: CURATOR_ROLE,
            decision: ApprovalDecisionOutcome.APPROVED,
          },
          {
            approverRole: CURATOR_ROLE,
            decision: ApprovalDecisionOutcome.APPROVED,
          },
        ],
      });
      prisma.changeRequest.findUnique.mockResolvedValue(crWithBothDecisions);

      await expect(
        service.submitDecision(
          'cr-id-1',
          { decision: ApprovalDecisionOutcome.APPROVED },
          'curator-user-2',
          CURATOR_ROLE,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps DB unique-constraint violation (P2002) to ConflictException', async () => {
      // Simulate a race condition: the app-level check passes (no existing
      // decisions in the snapshot) but the DB unique constraint fires when
      // the INSERT is attempted (another request committed first).
      const cr = makeCr({
        status: ChangeRequestStatus.PENDING_APPROVAL,
        approvalDecisions: [],
      });
      prisma.changeRequest.findUnique.mockResolvedValue(cr);

      const { Prisma: PrismaNamespace } = await import('@prisma/client');
      const prismaError = Object.assign(
        new Error(
          'Unique constraint failed on the fields: (`change_request_id`,`approver_role`)',
        ),
        { code: 'P2002', clientVersion: '6.0.0' },
      );
      Object.setPrototypeOf(
        prismaError,
        PrismaNamespace.PrismaClientKnownRequestError.prototype,
      );
      prisma.approvalDecision.create.mockRejectedValue(prismaError);

      await expect(
        service.submitDecision(
          'cr-id-1',
          { decision: ApprovalDecisionOutcome.APPROVED },
          'curator-user',
          CURATOR_ROLE,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws when the approval transition loses the optimistic concurrency race', async () => {
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(pendingCr())
        .mockResolvedValueOnce({ status: ChangeRequestStatus.REJECTED });
      prisma.approvalDecision.create.mockResolvedValue({});
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.submitDecision(
          'cr-id-1',
          {
            decision: ApprovalDecisionOutcome.REJECTED,
            comment: 'Rejected concurrently',
          },
          'curator-user',
          CURATOR_ROLE,
        ),
      ).rejects.toBeInstanceOf(InvalidStateTransitionException);

      expect(prisma.changeRequestAuditEntry.create).not.toHaveBeenCalled();
    });

    it('throws when status is not PENDING_APPROVAL', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.DRAFT }),
      );

      await expect(
        service.submitDecision(
          'cr-id-1',
          { decision: ApprovalDecisionOutcome.APPROVED },
          'curator-user',
          CURATOR_ROLE,
        ),
      ).rejects.toBeInstanceOf(InvalidStateTransitionException);
    });
  });

  // ── execute ───────────────────────────────────────────────────────────────

  describe('execute', () => {
    it('transitions APPROVED → EXECUTING and acquires locks', async () => {
      const cr = makeCr({ status: ChangeRequestStatus.APPROVED });
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(cr)
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.EXECUTING }));
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.capabilityLock.createMany.mockResolvedValue({ count: 2 });
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});

      await service.execute('cr-id-1', 'executor-user');

      expect(prisma.changeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ChangeRequestStatus.APPROVED }),
          data: { status: ChangeRequestStatus.EXECUTING },
        }),
      );
      expect(prisma.capabilityLock.createMany).toHaveBeenCalled();
    });

    it('throws CapabilityLockedException when a capability is locked by another CR', async () => {
      const cr = makeCr({ status: ChangeRequestStatus.APPROVED });
      prisma.changeRequest.findUnique.mockResolvedValue(cr);
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      // Simulate unique-constraint violation from Prisma
      const prismaError = Object.assign(
        new Error('Unique constraint failed on the fields: (`capability_id`)'),
        { code: 'P2002', clientVersion: '6.0.0' },
      );
      Object.setPrototypeOf(prismaError, (await import('@prisma/client')).Prisma.PrismaClientKnownRequestError.prototype);
      prisma.capabilityLock.createMany.mockRejectedValue(prismaError);

      await expect(service.execute('cr-id-1', 'user-1')).rejects.toBeInstanceOf(
        CapabilityLockedException,
      );
      await expect(service.execute('cr-id-1', 'user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects when status is not APPROVED', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.SUBMITTED }),
      );

      await expect(
        service.execute('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(InvalidStateTransitionException);
    });

    it('throws InvalidStateTransitionException on optimistic concurrency failure (updateMany count=0)', async () => {
      const cr = makeCr({ status: ChangeRequestStatus.APPROVED });
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(cr)
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.EXECUTING })); // re-read in error path
      // Simulate race: another request already transitioned the CR
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 0 });
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.EXECUTING }),
      );

      await expect(
        service.execute('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(InvalidStateTransitionException);
    });
  });

  // ── complete ──────────────────────────────────────────────────────────────

  describe('complete', () => {
    it('throws InvalidStateTransitionException when not in EXECUTING state', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.APPROVED }),
      );

      await expect(
        service.complete('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(InvalidStateTransitionException);
    });

    it('transitions EXECUTING → COMPLETED and releases locks', async () => {
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.EXECUTING }))
        .mockResolvedValueOnce(
          makeCr({ status: ChangeRequestStatus.COMPLETED }),
        );
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.capabilityLock.deleteMany.mockResolvedValue({ count: 2 });
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});

      await service.complete('cr-id-1', 'executor-user');

      expect(prisma.changeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ChangeRequestStatus.EXECUTING }),
          data: { status: ChangeRequestStatus.COMPLETED },
        }),
      );
      expect(prisma.capabilityLock.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { changeRequestId: 'cr-id-1' } }),
      );
    });

    it('throws BadRequestException when CR type is structural (must use /apply endpoint)', async () => {
      // REPARENT is a structural type — complete() must reject it to prevent
      // marking the CR done without applying any capability mutation.
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.EXECUTING, type: ChangeRequestType.REPARENT }),
      );

      await expect(
        service.complete('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── reportFailure ─────────────────────────────────────────────────────────

  describe('reportFailure', () => {
    it('rolls back EXECUTING → APPROVED and releases locks', async () => {
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.EXECUTING }))
        .mockResolvedValueOnce(
          makeCr({ status: ChangeRequestStatus.APPROVED }),
        );
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.capabilityLock.deleteMany.mockResolvedValue({ count: 2 });
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});

      await service.reportFailure('cr-id-1', 'executor-user', 'DB timeout');

      expect(prisma.changeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ChangeRequestStatus.EXECUTING }),
          data: { status: ChangeRequestStatus.APPROVED },
        }),
      );
      expect(prisma.capabilityLock.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { changeRequestId: 'cr-id-1' } }),
      );
    });

    it('throws when not in EXECUTING state', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.COMPLETED }),
      );

      await expect(
        service.reportFailure('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(InvalidStateTransitionException);
    });
  });

  // ── cancel ────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels a DRAFT change request', async () => {
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.DRAFT }))
        .mockResolvedValueOnce(
          makeCr({ status: ChangeRequestStatus.CANCELLED }),
        );
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});

      await service.cancel('cr-id-1', 'user-1', 'No longer needed');

      expect(prisma.changeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ChangeRequestStatus.CANCELLED },
        }),
      );
    });

    it('cancels a SUBMITTED change request', async () => {
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.SUBMITTED }))
        .mockResolvedValueOnce(
          makeCr({ status: ChangeRequestStatus.CANCELLED }),
        );
      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});

      await service.cancel('cr-id-1', 'user-1');

      expect(prisma.changeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ChangeRequestStatus.CANCELLED },
        }),
      );
    });

    it('rejects cancellation of PENDING_APPROVAL change requests', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.PENDING_APPROVAL }),
      );

      await expect(service.cancel('cr-id-1', 'user-1')).rejects.toBeInstanceOf(
        InvalidStateTransitionException,
      );
    });

    it('rejects cancellation of COMPLETED change requests (terminal)', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.COMPLETED }),
      );

      await expect(service.cancel('cr-id-1', 'user-1')).rejects.toBeInstanceOf(
        InvalidStateTransitionException,
      );
    });

    it('rejects cancellation of REJECTED change requests (terminal)', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.REJECTED }),
      );

      await expect(service.cancel('cr-id-1', 'user-1')).rejects.toBeInstanceOf(
        InvalidStateTransitionException,
      );
    });

    it('rejects cancellation of already CANCELLED change requests (terminal)', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({ status: ChangeRequestStatus.CANCELLED }),
      );

      await expect(service.cancel('cr-id-1', 'user-1')).rejects.toBeInstanceOf(
        InvalidStateTransitionException,
      );
    });
  });

  describe('applyStructuralOperation', () => {
    it('rejects single-target structural operations with multiple affected capabilities', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({
          status: ChangeRequestStatus.EXECUTING,
          type: ChangeRequestType.REPARENT,
          affectedCapabilityIds: ['cap-1', 'cap-2'],
        }),
      );

      await expect(
        service.applyStructuralOperation('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockStructuralOpsService.applyReparent).not.toHaveBeenCalled();
    });

    it('throws InvalidStateTransitionException when CR is not in EXECUTING status', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({
          status: ChangeRequestStatus.APPROVED,
          type: ChangeRequestType.REPARENT,
          affectedCapabilityIds: ['cap-1'],
        }),
      );

      await expect(
        service.applyStructuralOperation('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(InvalidStateTransitionException);

      expect(mockStructuralOpsService.applyReparent).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when CR type is not a structural operation (UPDATE)', async () => {
      prisma.changeRequest.findUnique.mockResolvedValue(
        makeCr({
          status: ChangeRequestStatus.EXECUTING,
          type: ChangeRequestType.UPDATE,
          affectedCapabilityIds: ['cap-1'],
        }),
      );

      await expect(
        service.applyStructuralOperation('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws InvalidStateTransitionException when optimistic concurrency guard fails inside transaction', async () => {
      // Outer findOne returns EXECUTING, but guard inside tx sees a different status
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(
          makeCr({
            status: ChangeRequestStatus.EXECUTING,
            type: ChangeRequestType.REPARENT,
            affectedCapabilityIds: ['cap-1'],
          }),
        )
        // Inside tx — guard check returns non-EXECUTING (concurrent mutation won the race)
        .mockResolvedValueOnce({ status: ChangeRequestStatus.COMPLETED });

      await expect(
        service.applyStructuralOperation('cr-id-1', 'user-1'),
      ).rejects.toBeInstanceOf(InvalidStateTransitionException);

      expect(mockStructuralOpsService.applyReparent).not.toHaveBeenCalled();
    });

    // ── Happy paths for each structural type ──────────────────────────────────

    /**
     * Helper: sets up mocks so applyStructuralOperation succeeds from EXECUTING → COMPLETED.
     * - findUnique[0]: pre-check CR (EXECUTING + given type)
     * - findUnique[1]: guard inside tx (still EXECUTING)
     * - structuralOpsService.<method>: returns opResult
     * - changeRequest.updateMany: completes CR
     * - capabilityLock.deleteMany: releases locks
     * - changeRequestAuditEntry.create: audit entry
     * - findUnique[2]: final findOne (COMPLETED CR)
     */
    function setupHappyPath(
      type: ChangeRequestType,
      affectedCapabilityIds: string[],
      opResult: { type: string; payload: Record<string, unknown> },
      serviceMethod: keyof typeof mockStructuralOpsService,
    ) {
      prisma.changeRequest.findUnique
        .mockResolvedValueOnce(
          makeCr({ status: ChangeRequestStatus.EXECUTING, type, affectedCapabilityIds }),
        )
        .mockResolvedValueOnce({ status: ChangeRequestStatus.EXECUTING })
        .mockResolvedValueOnce(makeCr({ status: ChangeRequestStatus.COMPLETED, type }));

      (mockStructuralOpsService[serviceMethod] as jest.Mock).mockResolvedValueOnce(opResult);

      prisma.changeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.capabilityLock.deleteMany.mockResolvedValue({ count: 1 });
      prisma.changeRequestAuditEntry.create.mockResolvedValue({});
    }

    it('REPARENT: delegates to applyReparent, transitions CR to COMPLETED, releases locks, emits event', async () => {
      const opResult = {
        type: 'REPARENT' as const,
        payload: { capabilityId: 'cap-1', oldParentId: null, newParentId: null, changeRequestId: 'cr-id-1', actorId: 'user-1', occurredAt: new Date() },
      };
      setupHappyPath(ChangeRequestType.REPARENT, ['cap-1'], opResult, 'applyReparent');

      const result = await service.applyStructuralOperation('cr-id-1', 'user-1');

      expect(mockStructuralOpsService.applyReparent).toHaveBeenCalledWith(
        'cr-id-1', 'cap-1', null, 'user-1', mockPrismaService,
      );
      expect(prisma.changeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ChangeRequestStatus.EXECUTING }),
          data: { status: ChangeRequestStatus.COMPLETED },
        }),
      );
      expect(prisma.capabilityLock.deleteMany).toHaveBeenCalledWith({
        where: { changeRequestId: 'cr-id-1' },
      });
      expect(prisma.changeRequestAuditEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'STRUCTURAL_OPERATION_APPLIED' }),
        }),
      );
      expect(mockStructuralOpsService.emitDomainEvent).toHaveBeenCalledWith(opResult);
      expect(result).toBeDefined();
    });

    it('PROMOTE: delegates to applyPromote and completes', async () => {
      const opResult = {
        type: 'PROMOTE' as const,
        payload: { capabilityId: 'cap-1', changeRequestId: 'cr-id-1', actorId: 'user-1', occurredAt: new Date() },
      };
      setupHappyPath(ChangeRequestType.PROMOTE, ['cap-1'], opResult, 'applyPromote');

      await service.applyStructuralOperation('cr-id-1', 'user-1');

      expect(mockStructuralOpsService.applyPromote).toHaveBeenCalledWith(
        'cr-id-1', 'cap-1', 'user-1', mockPrismaService,
      );
      expect(mockStructuralOpsService.emitDomainEvent).toHaveBeenCalledWith(opResult);
    });

    it('DEMOTE: delegates to applyDemote and completes', async () => {
      const opResult = {
        type: 'DEMOTE' as const,
        payload: { capabilityId: 'cap-1', changeRequestId: 'cr-id-1', actorId: 'user-1', occurredAt: new Date() },
      };
      setupHappyPath(ChangeRequestType.DEMOTE, ['cap-1'], opResult, 'applyDemote');

      await service.applyStructuralOperation('cr-id-1', 'user-1');

      expect(mockStructuralOpsService.applyDemote).toHaveBeenCalledWith(
        'cr-id-1', 'cap-1', 'user-1', mockPrismaService,
      );
      expect(mockStructuralOpsService.emitDomainEvent).toHaveBeenCalledWith(opResult);
    });

    it('MERGE: delegates to applyMerge with full affectedCapabilityIds array', async () => {
      const opResult = {
        type: 'MERGE' as const,
        payload: {
          survivorCapabilityId: 'cap-survivor',
          retiredSourceIds: ['cap-source'],
          transferredChildCount: 0,
          transferredMappingCount: 0,
          changeRequestId: 'cr-id-1',
          actorId: 'user-1',
          occurredAt: new Date(),
        },
      };
      setupHappyPath(ChangeRequestType.MERGE, ['cap-survivor', 'cap-source'], opResult, 'applyMerge');

      await service.applyStructuralOperation('cr-id-1', 'user-1');

      expect(mockStructuralOpsService.applyMerge).toHaveBeenCalledWith(
        'cr-id-1', ['cap-survivor', 'cap-source'], null, 'user-1', mockPrismaService,
      );
      expect(mockStructuralOpsService.emitDomainEvent).toHaveBeenCalledWith(opResult);
    });

    it('RETIRE: delegates to applyRetire with full affectedCapabilityIds array', async () => {
      const opResult = {
        type: 'RETIRE' as const,
        payload: {
          retiredCapabilityIds: ['cap-1'],
          flaggedMappingIds: [],
          effectiveTo: new Date(),
          changeRequestId: 'cr-id-1',
          actorId: 'user-1',
          occurredAt: new Date(),
        },
      };
      setupHappyPath(ChangeRequestType.RETIRE, ['cap-1'], opResult, 'applyRetire');

      await service.applyStructuralOperation('cr-id-1', 'user-1');

      expect(mockStructuralOpsService.applyRetire).toHaveBeenCalledWith(
        'cr-id-1', ['cap-1'], null, 'user-1', mockPrismaService,
      );
      expect(mockStructuralOpsService.emitDomainEvent).toHaveBeenCalledWith(opResult);
    });

    it('DELETE: delegates to applyDelete with full affectedCapabilityIds array', async () => {
      const opResult = {
        type: 'DELETE' as const,
        payload: { capabilityId: 'cap-1', changeRequestId: 'cr-id-1', actorId: 'user-1', occurredAt: new Date() },
      };
      setupHappyPath(ChangeRequestType.DELETE, ['cap-1'], opResult, 'applyDelete');

      await service.applyStructuralOperation('cr-id-1', 'user-1');

      expect(mockStructuralOpsService.applyDelete).toHaveBeenCalledWith(
        'cr-id-1', ['cap-1'], 'user-1', mockPrismaService,
      );
      expect(mockStructuralOpsService.emitDomainEvent).toHaveBeenCalledWith(opResult);
    });
  });
});
