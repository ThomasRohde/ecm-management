import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  ApprovalDecisionOutcome,
  AuditAction,
  AuditEntityType,
  ChangeRequestStatus,
  ChangeRequestType,
  NotificationEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateChangeRequestDto } from './dto/create-change-request.dto';
import type { ApprovalDecisionDto } from './dto/approval-decision.dto';
import type { ListChangeRequestsDto } from './dto/list-change-requests.dto';
import { ChangeRequestNotFoundException } from './exceptions/change-request-not-found.exception';
import { InvalidStateTransitionException } from './exceptions/invalid-state-transition.exception';
import { CapabilityLockedException } from './exceptions/capability-locked.exception';
import { InsufficientApprovalRoleException } from './exceptions/insufficient-approval-role.exception';
import { StructuralOpsService } from '../structural-ops/structural-ops.service';
import { ImpactAnalysisService } from '../impact-analysis/impact-analysis.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';

// Prisma requires this sentinel to explicitly store JSON null in a nullable
// Json field.  Plain `null` is not assignable to NullableJsonNullValueInput.
const JSON_NULL = Prisma.JsonNull;

// ─── Approval role constants ─────────────────────────────────────────────────

export const CURATOR_ROLE = 'curator';
export const GOVERNANCE_BOARD_ROLE = 'governance-board';

// ─── State machine ────────────────────────────────────────────────────────────

/**
 * Terminal statuses from which no further transitions are permitted.
 */
const TERMINAL_STATUSES = new Set<ChangeRequestStatus>([
  ChangeRequestStatus.COMPLETED,
  ChangeRequestStatus.REJECTED,
  ChangeRequestStatus.CANCELLED,
]);

/**
 * Statuses that are considered "active" — i.e. the change request is still
 * in-flight and may be affecting capabilities.
 */
export const ACTIVE_STATUSES: ChangeRequestStatus[] = [
  ChangeRequestStatus.DRAFT,
  ChangeRequestStatus.SUBMITTED,
  ChangeRequestStatus.PENDING_APPROVAL,
  ChangeRequestStatus.APPROVED,
  ChangeRequestStatus.EXECUTING,
];

/**
 * Explicit transition map.  Only listed transitions are valid; the service
 * enforces this before any mutation.
 */
const VALID_TRANSITIONS: Readonly<
  Partial<Record<ChangeRequestStatus, ReadonlyArray<ChangeRequestStatus>>>
> = {
  [ChangeRequestStatus.DRAFT]: [
    ChangeRequestStatus.SUBMITTED,
    ChangeRequestStatus.CANCELLED,
  ],
  [ChangeRequestStatus.SUBMITTED]: [
    ChangeRequestStatus.PENDING_APPROVAL,
    ChangeRequestStatus.CANCELLED,
  ],
  [ChangeRequestStatus.PENDING_APPROVAL]: [
    ChangeRequestStatus.APPROVED,
    ChangeRequestStatus.REJECTED,
  ],
  [ChangeRequestStatus.APPROVED]: [ChangeRequestStatus.EXECUTING],
  // EXECUTING → APPROVED is the execution-failure rollback (no new status)
  [ChangeRequestStatus.EXECUTING]: [
    ChangeRequestStatus.COMPLETED,
    ChangeRequestStatus.APPROVED,
  ],
};

// ─── Prisma include shapes ────────────────────────────────────────────────────

const CR_DETAIL_INCLUDE = {
  approvalDecisions: { orderBy: { decidedAt: 'asc' as const } },
  auditEntries: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ChangeRequestInclude;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ChangeRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly structuralOpsService: StructuralOpsService,
    private readonly impactAnalysisService: ImpactAnalysisService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  async findAll(filters: ListChangeRequestsDto) {
    const where: Prisma.ChangeRequestWhereInput = {};

    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.requestedBy) where.requestedBy = filters.requestedBy;

    const [items, total] = await Promise.all([
      this.prisma.changeRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: CR_DETAIL_INCLUDE,
      }),
      this.prisma.changeRequest.count({ where }),
    ]);

    return { items, total };
  }

  async findOne(id: string) {
    const cr = await this.prisma.changeRequest.findUnique({
      where: { id },
      include: CR_DETAIL_INCLUDE,
    });

    if (!cr) {
      throw new ChangeRequestNotFoundException(id);
    }

    return cr;
  }

  async findActiveByCapabilityId(capabilityId: string) {
    const items = await this.prisma.changeRequest.findMany({
      where: {
        affectedCapabilityIds: { has: capabilityId },
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
      include: CR_DETAIL_INCLUDE,
    });

    return { items, total: items.length };
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async create(dto: CreateChangeRequestDto, requestedBy: string) {
    const cr = await this.prisma.changeRequest.create({
      data: {
        type: dto.type,
        status: ChangeRequestStatus.DRAFT,
        requestedBy,
        rationale: dto.rationale,
        affectedCapabilityIds: dto.affectedCapabilityIds,
        downstreamPlan: dto.downstreamPlan ?? null,
        impactSummary: dto.impactSummary ?? null,
        operationPayload: dto.operationPayload
          ? (dto.operationPayload as Prisma.InputJsonValue)
          : undefined,
      },
      include: CR_DETAIL_INCLUDE,
    });

    await this.appendAudit(cr.id, {
      actorId: requestedBy,
      eventType: 'CREATED',
      fromStatus: null,
      toStatus: ChangeRequestStatus.DRAFT,
      comment: null,
      metadata: null,
    });

    // Generic audit trail – fire-and-forget
    void this.auditService.record({
      entityType: AuditEntityType.CHANGE_REQUEST,
      entityId: cr.id,
      action: AuditAction.CREATE,
      actorId: requestedBy,
      after: { type: cr.type, status: cr.status, requestedBy },
    });

    return this.findOne(cr.id);
  }

  async submit(id: string, actorId: string) {
    const cr = await this.findOne(id);
    this.assertValidTransition(cr.status, ChangeRequestStatus.SUBMITTED, 'submit');

    return this.applyTransition(
      id,
      cr.status,
      ChangeRequestStatus.SUBMITTED,
      actorId,
      'SUBMITTED',
    );
  }

  async requestApproval(id: string, actorId: string) {
    const cr = await this.findOne(id);
    this.assertValidTransition(
      cr.status,
      ChangeRequestStatus.PENDING_APPROVAL,
      'request-approval',
    );

    // ── Impact-analysis gate ─────────────────────────────────────────────────
    // Before entering the approval queue, compute impact and enforce:
    //   1. RETIRE and MERGE operations that have active mappings MUST provide a
    //      downstreamPlan — approvers need to know how impacted systems will
    //      be handled before they can make a meaningful decision.
    //   2. Auto-populate impactSummary on the CR if it is still null, giving
    //      approvers an at-a-glance view in the approval UI.
    // We do this at request-approval time (not at creation) to capture the
    // live mapping state rather than what existed when the draft was created.
    const DESTRUCTIVE_TYPES = new Set<ChangeRequestType>([
      ChangeRequestType.RETIRE,
      ChangeRequestType.MERGE,
    ]);

    const impact = await this.impactAnalysisService.analyse(
      cr.affectedCapabilityIds,
      cr.type as ChangeRequestType,
    );

    if (
      DESTRUCTIVE_TYPES.has(cr.type as ChangeRequestType) &&
      impact.summary.activeMappings > 0 &&
      !(cr.downstreamPlan?.trim())
    ) {
      throw new BadRequestException(
        `Change request type "${cr.type}" has ${impact.summary.activeMappings} active mapping(s) affecting ` +
          `${impact.summary.affectedSystemCount} system(s). A downstreamPlan is required before requesting approval. ` +
          `Update the change request with a plan for handling impacted downstream consumers.`,
      );
    }

    // Auto-compute and persist impactSummary when it has not been set manually.
    const computedSummary =
      `severity:${impact.summary.severity} ` +
      `mappings:${impact.summary.totalMappings}(active:${impact.summary.activeMappings}) ` +
      `systems:${impact.summary.affectedSystemCount}`;

    if (!cr.impactSummary) {
      await this.prisma.changeRequest.update({
        where: { id },
        data: { impactSummary: computedSummary },
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    return this.applyTransition(
      id,
      cr.status,
      ChangeRequestStatus.PENDING_APPROVAL,
      actorId,
      'PENDING_APPROVAL',
    );
  }

  /**
   * Submit an approval decision.  Curator must decide first; if the curator
   * approves, governance-board then decides.  Either role can reject.
   */
  async submitDecision(
    id: string,
    dto: ApprovalDecisionDto,
    actorId: string,
    actorRole: string,
  ) {
    const cr = await this.findOne(id);

    if (cr.status !== ChangeRequestStatus.PENDING_APPROVAL) {
      throw new InvalidStateTransitionException(cr.status, 'submit-decision');
    }

    const curatorDecision = cr.approvalDecisions.find(
      (d) => d.approverRole === CURATOR_ROLE,
    );
    const governanceBoardDecision = cr.approvalDecisions.find(
      (d) => d.approverRole === GOVERNANCE_BOARD_ROLE,
    );

    // Prevent duplicate decision by same role (check before sequencing so the
    // error is as specific as possible regardless of which step they're at).
    const duplicate = cr.approvalDecisions.find(
      (d) => d.approverRole === actorRole,
    );
    if (duplicate) {
      throw new ConflictException(
        `A decision from role "${actorRole}" has already been recorded`,
      );
    }

    // Validate sequencing
    if (!curatorDecision) {
      if (actorRole !== CURATOR_ROLE) {
        throw new InsufficientApprovalRoleException(
          `curator approval must be recorded before governance-board may act`,
        );
      }
    } else if (curatorDecision.decision === ApprovalDecisionOutcome.APPROVED) {
      if (governanceBoardDecision) {
        throw new BadRequestException(
          'All required approvals have already been submitted for this change request',
        );
      }
      if (actorRole !== GOVERNANCE_BOARD_ROLE) {
        throw new InsufficientApprovalRoleException(
          `curator has approved; awaiting governance-board decision`,
        );
      }
    } else {
      // Curator rejected — the transition handler should have set status to
      // REJECTED already; guard against stale state.
      throw new BadRequestException(
        'Curator has already rejected this change request',
      );
    }

    // Determine resulting status change, if any
    let newStatus: ChangeRequestStatus | null = null;
    let eventType: string;

    if (dto.decision === ApprovalDecisionOutcome.REJECTED) {
      newStatus = ChangeRequestStatus.REJECTED;
      eventType = 'REJECTED';
    } else if (actorRole === GOVERNANCE_BOARD_ROLE) {
      // Both curator and governance-board have approved
      newStatus = ChangeRequestStatus.APPROVED;
      eventType = 'APPROVED';
    } else {
      // Curator approved — waiting for governance-board
      eventType = 'CURATOR_APPROVED';
    }

    await this.prisma.$transaction(async (tx) => {
      // The application-level duplicate check above (line ~222) covers the
      // common case.  The DB unique constraint on (change_request_id,
      // approver_role) closes the TOCTOU window for concurrent requests — the
      // P2002 catch below maps that violation to a clean ConflictException.
      await tx.approvalDecision.create({
        data: {
          changeRequestId: id,
          approverRole: actorRole,
          approverId: actorId,
          decision: dto.decision,
          comment: dto.comment ?? null,
        },
      });

      if (newStatus) {
        const updated = await tx.changeRequest.updateMany({
          where: { id, status: ChangeRequestStatus.PENDING_APPROVAL },
          data: { status: newStatus },
        });

        if (updated.count === 0) {
          const current = await tx.changeRequest.findUnique({
            where: { id },
            select: { status: true },
          });
          const actualStatus =
            current?.status ?? ChangeRequestStatus.PENDING_APPROVAL;
          throw new InvalidStateTransitionException(actualStatus, eventType);
        }
      }

      await tx.changeRequestAuditEntry.create({
        data: {
          changeRequestId: id,
          actorId,
          eventType,
          fromStatus: ChangeRequestStatus.PENDING_APPROVAL,
          toStatus: newStatus ?? ChangeRequestStatus.PENDING_APPROVAL,
          comment: dto.comment ?? null,
          metadata: { approverRole: actorRole, decision: dto.decision },
        },
      });
    }).catch((error: unknown) => {
      // Race condition: another concurrent request inserted the same role
      // before our transaction committed — surface as 409 Conflict.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `A decision from role "${actorRole}" has already been recorded`,
        );
      }
      throw error;
    });

    const updatedCr = await this.findOne(id);

    // Generic audit trail for decision-level events – fire-and-forget.
    if (newStatus) {
      void this.auditService.record({
        entityType: AuditEntityType.CHANGE_REQUEST,
        entityId: id,
        action:
          newStatus === ChangeRequestStatus.APPROVED
            ? AuditAction.APPROVE
            : AuditAction.REJECT,
        actorId,
        metadata: { approverRole: actorRole, decision: dto.decision, newStatus },
      });

      // Notify original requester of final approval/rejection outcome.
      void this.notifyCrRecipient(newStatus, id, updatedCr.requestedBy);
    }

    return updatedCr;
  }

  /**
   * Transition APPROVED → EXECUTING and acquire capability locks.
   */
  async execute(id: string, actorId: string) {
    const cr = await this.findOne(id);
    this.assertValidTransition(cr.status, ChangeRequestStatus.EXECUTING, 'execute');

    try {
      await this.prisma.$transaction(async (tx) => {
        // Status-guarded update (optimistic concurrency — prevents double-execute)
        const updated = await tx.changeRequest.updateMany({
          where: { id, status: ChangeRequestStatus.APPROVED },
          data: { status: ChangeRequestStatus.EXECUTING },
        });

        if (updated.count === 0) {
          throw new InvalidStateTransitionException(cr.status, 'execute');
        }

        // Acquire one lock per affected capability.  skipDuplicates is
        // intentionally absent — if any capability is already locked the
        // unique constraint throws P2002 and we rethrow as a 409 below.
        await tx.capabilityLock.createMany({
          data: cr.affectedCapabilityIds.map((capabilityId) => ({
            capabilityId,
            changeRequestId: id,
            lockedBy: actorId,
          })),
        });

        await tx.changeRequestAuditEntry.create({
          data: {
            changeRequestId: id,
            actorId,
            eventType: 'EXECUTION_STARTED',
            fromStatus: ChangeRequestStatus.APPROVED,
            toStatus: ChangeRequestStatus.EXECUTING,
            comment: null,
            metadata: { lockedCapabilityIds: cr.affectedCapabilityIds },
          },
        });
      });
    } catch (error) {
      // Unique-constraint violation from capabilityLock — map to domain error
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new CapabilityLockedException(cr.affectedCapabilityIds);
      }
      throw error;
    }

    return this.findOne(id);
  }

  /**
   * Transition EXECUTING → COMPLETED and release capability locks.
   *
   * Structural CRs (REPARENT, PROMOTE, DEMOTE, MERGE, RETIRE, DELETE) must be
   * completed via `applyStructuralOperation()` which applies the capability
   * mutation atomically with the status transition.  Calling `complete()` on a
   * structural CR would mark it done without actually making any data change.
   */
  async complete(id: string, actorId: string) {
    const cr = await this.findOne(id);
    this.assertValidTransition(cr.status, ChangeRequestStatus.COMPLETED, 'complete');

    // Structural types must go through applyStructuralOperation, not this endpoint.
    const STRUCTURAL_TYPES = new Set<ChangeRequestType>([
      ChangeRequestType.REPARENT,
      ChangeRequestType.PROMOTE,
      ChangeRequestType.DEMOTE,
      ChangeRequestType.MERGE,
      ChangeRequestType.RETIRE,
      ChangeRequestType.DELETE,
    ]);
    if (STRUCTURAL_TYPES.has(cr.type)) {
      throw new BadRequestException(
        `Change request type "${cr.type}" is a structural operation and cannot be ` +
          `completed via this endpoint. Use POST /change-requests/:id/apply instead.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.changeRequest.updateMany({
        where: { id, status: ChangeRequestStatus.EXECUTING },
        data: { status: ChangeRequestStatus.COMPLETED },
      });

      if (updated.count === 0) {
        throw new InvalidStateTransitionException(cr.status, 'complete');
      }

      await tx.capabilityLock.deleteMany({
        where: { changeRequestId: id },
      });

      await tx.changeRequestAuditEntry.create({
        data: {
          changeRequestId: id,
          actorId,
          eventType: 'EXECUTION_COMPLETED',
          fromStatus: ChangeRequestStatus.EXECUTING,
          toStatus: ChangeRequestStatus.COMPLETED,
          comment: null,
          metadata: JSON_NULL,
        },
      });
    });

    return this.findOne(id);
  }

  /**
   * Report execution failure: release locks and roll back to APPROVED so the
   * request can be retried without inventing a new status.
   */
  async reportFailure(id: string, actorId: string, comment?: string) {
    const cr = await this.findOne(id);

    if (cr.status !== ChangeRequestStatus.EXECUTING) {
      throw new InvalidStateTransitionException(cr.status, 'report-failure');
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.changeRequest.updateMany({
        where: { id, status: ChangeRequestStatus.EXECUTING },
        data: { status: ChangeRequestStatus.APPROVED },
      });

      if (updated.count === 0) {
        throw new InvalidStateTransitionException(cr.status, 'report-failure');
      }

      await tx.capabilityLock.deleteMany({
        where: { changeRequestId: id },
      });

      await tx.changeRequestAuditEntry.create({
        data: {
          changeRequestId: id,
          actorId,
          eventType: 'EXECUTION_FAILED',
          fromStatus: ChangeRequestStatus.EXECUTING,
          toStatus: ChangeRequestStatus.APPROVED,
          comment: comment ?? null,
          metadata: JSON_NULL,
        },
      });
    });

    return this.findOne(id);
  }

  /**
   * Structural operations (REPARENT, PROMOTE, DEMOTE, MERGE, RETIRE, DELETE).
   *
   * Precondition: CR must be in EXECUTING status (caller must have called
   * `execute()` first to acquire locks).
   *
   * The operation and CR completion are applied atomically.  Domain events
   * are emitted after the transaction commits so consumers never see events
   * for rolled-back changes.
   *
   * If this method throws, the CR remains in EXECUTING status.  The caller
   * should invoke `reportFailure()` to roll back to APPROVED for retry.
   */
  async applyStructuralOperation(id: string, actorId: string) {
    const cr = await this.findOne(id);

    if (cr.status !== ChangeRequestStatus.EXECUTING) {
      throw new InvalidStateTransitionException(
        cr.status,
        'apply-structural-operation',
      );
    }

    const structuralTypes = new Set<ChangeRequestType>([
      ChangeRequestType.REPARENT,
      ChangeRequestType.PROMOTE,
      ChangeRequestType.DEMOTE,
      ChangeRequestType.MERGE,
      ChangeRequestType.RETIRE,
      ChangeRequestType.DELETE,
    ]);

    if (!structuralTypes.has(cr.type)) {
      throw new BadRequestException(
        `Change request type "${cr.type}" is not a structural operation. ` +
          `Use the /complete endpoint for CREATE and UPDATE requests.`,
      );
    }

    // Capture the result outside the transaction so we can emit domain events
    // after commit.
    let resultForEvent: Awaited<ReturnType<typeof this.dispatchOp>>;

    await this.prisma.$transaction(async (tx) => {
      // 1. Guard — optimistic concurrency: ensure CR is still EXECUTING
      const guard = await tx.changeRequest.findUnique({
        where: { id },
        select: { status: true },
      });
      if (guard?.status !== ChangeRequestStatus.EXECUTING) {
        throw new InvalidStateTransitionException(
          guard?.status ?? cr.status,
          'apply-structural-operation',
        );
      }

      // 2. Perform the structural operation
      resultForEvent = await this.dispatchOp(cr, actorId, tx);

      // 3. Transition CR to COMPLETED with optimistic concurrency guard
      const completedUpdate = await tx.changeRequest.updateMany({
        where: { id, status: ChangeRequestStatus.EXECUTING },
        data: { status: ChangeRequestStatus.COMPLETED },
      });
      if (completedUpdate.count === 0) {
        throw new InvalidStateTransitionException(
          ChangeRequestStatus.EXECUTING,
          'apply-structural-operation',
        );
      }

      await tx.capabilityLock.deleteMany({ where: { changeRequestId: id } });

      await tx.changeRequestAuditEntry.create({
        data: {
          changeRequestId: id,
          actorId,
          eventType: 'STRUCTURAL_OPERATION_APPLIED',
          fromStatus: ChangeRequestStatus.EXECUTING,
          toStatus: ChangeRequestStatus.COMPLETED,
          comment: null,
          metadata: resultForEvent.payload as unknown as Prisma.InputJsonValue,
        },
      });
    });

    // 4. Emit domain event AFTER transaction commits
    this.structuralOpsService.emitDomainEvent(resultForEvent!);

    return this.findOne(id);
  }

  /**
   * Cancel a change request.  Only DRAFT and SUBMITTED requests may be
   * cancelled; anything further in the pipeline must be rejected via the
   * approval flow or allowed to complete.
   */
  async cancel(id: string, actorId: string, comment?: string) {
    const cr = await this.findOne(id);
    this.assertValidTransition(cr.status, ChangeRequestStatus.CANCELLED, 'cancel');

    return this.applyTransition(
      id,
      cr.status,
      ChangeRequestStatus.CANCELLED,
      actorId,
      'CANCELLED',
      comment,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private assertValidTransition(
    from: ChangeRequestStatus,
    to: ChangeRequestStatus,
    action: string,
  ): void {
    if (TERMINAL_STATUSES.has(from)) {
      throw new InvalidStateTransitionException(from, action);
    }

    const allowed = VALID_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionException(from, action);
    }
  }

  private async applyTransition(
    id: string,
    fromStatus: ChangeRequestStatus,
    toStatus: ChangeRequestStatus,
    actorId: string,
    eventType: string,
    comment?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      // Guard the update with the expected current status so concurrent
      // requests that have already mutated the row won't silently overwrite it.
      const updated = await tx.changeRequest.updateMany({
        where: { id, status: fromStatus },
        data: { status: toStatus },
      });

      if (updated.count === 0) {
        // Another request already transitioned this CR; re-read and throw.
        const current = await tx.changeRequest.findUnique({
          where: { id },
          select: { status: true },
        });
        const actualStatus = current?.status ?? fromStatus;
        throw new InvalidStateTransitionException(actualStatus, eventType);
      }

      await tx.changeRequestAuditEntry.create({
        data: {
          changeRequestId: id,
          actorId,
          eventType,
          fromStatus,
          toStatus,
          comment: comment ?? null,
          metadata: JSON_NULL,
        },
      });
    });

    const cr = await this.findOne(id);

    // Generic audit trail – fire-and-forget
    void this.auditService.record({
      entityType: AuditEntityType.CHANGE_REQUEST,
      entityId: id,
      action: this.statusToAuditAction(toStatus),
      actorId,
      metadata: { fromStatus, toStatus, eventType },
    });

    // Notify the original requester on terminal or significant transitions.
    void this.notifyCrRecipient(toStatus, id, cr.requestedBy);

    return cr;
  }

  private async appendAudit(
    changeRequestId: string,
    entry: {
      actorId: string;
      eventType: string;
      fromStatus: ChangeRequestStatus | null;
      toStatus: ChangeRequestStatus | null;
      comment: string | null;
      metadata: Record<string, unknown> | null;
    },
  ) {
    await this.prisma.changeRequestAuditEntry.create({
      data: {
        changeRequestId,
        actorId: entry.actorId,
        eventType: entry.eventType,
        fromStatus: entry.fromStatus ?? undefined,
        toStatus: entry.toStatus ?? undefined,
        comment: entry.comment,
        metadata: entry.metadata ? (entry.metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  /**
   * Route to the correct StructuralOpsService method based on CR type.
   * All methods receive the Prisma transaction client so that capability
   * mutations are part of the same atomic write as the CR completion.
   */
  private async dispatchOp(
    cr: Awaited<ReturnType<typeof this.findOne>>,
    actorId: string,
    tx: Prisma.TransactionClient,
  ) {
    switch (cr.type) {
      case ChangeRequestType.REPARENT:
        return this.structuralOpsService.applyReparent(
          cr.id,
          this.requireSingleTargetCapabilityId(cr),
          cr.operationPayload,
          actorId,
          tx,
        );

      case ChangeRequestType.PROMOTE:
        return this.structuralOpsService.applyPromote(
          cr.id,
          this.requireSingleTargetCapabilityId(cr),
          actorId,
          tx,
        );

      case ChangeRequestType.DEMOTE:
        return this.structuralOpsService.applyDemote(
          cr.id,
          this.requireSingleTargetCapabilityId(cr),
          actorId,
          tx,
        );

      case ChangeRequestType.MERGE:
        return this.structuralOpsService.applyMerge(
          cr.id,
          cr.affectedCapabilityIds,
          cr.operationPayload,
          actorId,
          tx,
        );

      case ChangeRequestType.RETIRE:
        return this.structuralOpsService.applyRetire(
          cr.id,
          cr.affectedCapabilityIds,
          cr.operationPayload,
          actorId,
          tx,
        );

      case ChangeRequestType.DELETE:
        return this.structuralOpsService.applyDelete(
          cr.id,
          cr.affectedCapabilityIds,
          actorId,
          tx,
        );

      default:
        // TypeScript exhaustiveness: only structural types reach here
        throw new BadRequestException(
          `No structural operation handler for type "${String(cr.type)}"`,
        );
    }
  }

  private requireSingleTargetCapabilityId(
    cr: Awaited<ReturnType<typeof this.findOne>>,
  ): string {
    if (cr.affectedCapabilityIds.length !== 1) {
      throw new BadRequestException(
        `${cr.type} change request must target exactly one capability; got ${cr.affectedCapabilityIds.length}`,
      );
    }

    return cr.affectedCapabilityIds[0];
  }

  // ── Audit / notification helpers ──────────────────────────────────────────

  /**
   * Maps a ChangeRequestStatus to the closest AuditAction verb.
   * Used for generic AuditEntry records alongside the CR-scoped audit trail.
   */
  private statusToAuditAction(status: ChangeRequestStatus): AuditAction {
    const map: Partial<Record<ChangeRequestStatus, AuditAction>> = {
      [ChangeRequestStatus.SUBMITTED]: AuditAction.SUBMIT,
      [ChangeRequestStatus.CANCELLED]: AuditAction.CANCEL,
      [ChangeRequestStatus.APPROVED]: AuditAction.APPROVE,
      [ChangeRequestStatus.REJECTED]: AuditAction.REJECT,
      [ChangeRequestStatus.COMPLETED]: AuditAction.UPDATE,
      [ChangeRequestStatus.EXECUTING]: AuditAction.UPDATE,
      [ChangeRequestStatus.PENDING_APPROVAL]: AuditAction.UPDATE,
    };
    return map[status] ?? AuditAction.UPDATE;
  }

  /**
   * Generate a TaskOrNotification for the CR's original requester on
   * significant lifecycle transitions.  Fire-and-forget – never awaited.
   *
   * Recipients may not exist in the User table yet (Phase 9A auth is TODO).
   * When the FK fails the error is swallowed here; it surfaces in logs via
   * the Prisma exception layer but does not affect the business operation.
   */
  private notifyCrRecipient(
    toStatus: ChangeRequestStatus,
    crId: string,
    requestedBy: string,
  ): void {
    const config: Partial<
      Record<
        ChangeRequestStatus,
        { eventType: NotificationEventType; title: string; body: string }
      >
    > = {
      [ChangeRequestStatus.SUBMITTED]: {
        eventType: NotificationEventType.CHANGE_REQUEST_SUBMITTED,
        title: 'Change request submitted',
        body: `Change request ${crId} has been submitted for review.`,
      },
      [ChangeRequestStatus.APPROVED]: {
        eventType: NotificationEventType.CHANGE_REQUEST_APPROVED,
        title: 'Change request approved',
        body: `Change request ${crId} has been approved and is ready to execute.`,
      },
      [ChangeRequestStatus.REJECTED]: {
        eventType: NotificationEventType.CHANGE_REQUEST_REJECTED,
        title: 'Change request rejected',
        body: `Change request ${crId} was rejected during the approval process.`,
      },
    };

    const entry = config[toStatus];
    if (!entry) return;

    void this.notificationService
      .create({
        eventType: entry.eventType,
        recipientId: requestedBy,
        entityType: AuditEntityType.CHANGE_REQUEST,
        entityId: crId,
        title: entry.title,
        body: entry.body,
        metadata: { changeRequestId: crId, status: toStatus },
      })
      .catch(() => {
        // Notification failure must never break the CR workflow.
        // Prisma FK errors (unknown recipientId) are logged here and discarded.
      });
  }
}
