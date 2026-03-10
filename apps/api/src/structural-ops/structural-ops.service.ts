/**
 * StructuralOpsService
 *
 * Executes the structural capability operations that are performed when an
 * approved change request enters the EXECUTING state and `applyStructuralOperation`
 * is called.
 *
 * Each public `apply*` method accepts a Prisma transaction client so the
 * capability mutations and CR audit entry can all be committed atomically.
 * Domain events are emitted only after the calling service confirms the
 * transaction has committed.
 *
 * Supported operations:
 *   REPARENT  – move a capability under a new (or null) parent
 *   PROMOTE   – change a LEAF capability to ABSTRACT
 *   DEMOTE    – change an ABSTRACT capability to LEAF (requires no children)
 *   MERGE     – absorb one or more source capabilities into a survivor
 *   RETIRE    – set lifecycleStatus = RETIRED and flag active mappings
 *   DELETE    – hard-delete a DRAFT capability or one flagged as erroneous, with no children
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CapabilityType, CapabilityVersionChangeType, LifecycleStatus, MappingState, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DomainEventBus,
  type CapabilityReparentedPayload,
  type CapabilityPromotedPayload,
  type CapabilityDemotedPayload,
  type CapabilityMergedPayload,
  type CapabilityRetiredPayload,
  type CapabilityDeletedPayload,
} from './events/capability-domain-events';
import { CapabilityVersionService } from '../versioning/capability-version.service';

// ─── Payload contracts ────────────────────────────────────────────────────────

/**
 * Typed operation payloads – these are what callers store in
 * ChangeRequest.operationPayload (a Json? column).
 *
 * We define them here as the single source of truth and cast the raw JSON
 * at the service boundary.
 */

export interface ReparentPayload {
  /** UUID of the new parent, or null / omitted to move the capability to root level. */
  newParentId?: string | null;
}

export interface MergePayload {
  /** UUID of the capability that should survive the merge. */
  survivorCapabilityId: string;
}

export interface RetirePayload {
  /**
   * ISO-8601 date string for when the capability is no longer effective.
   * Defaults to the execution timestamp if omitted.
   */
  effectiveTo?: string;
}

// PROMOTE, DEMOTE, DELETE carry no additional payload beyond affectedCapabilityIds.

// ─── Internal result shapes ───────────────────────────────────────────────────

export interface ReparentResult {
  type: 'REPARENT';
  payload: CapabilityReparentedPayload;
}

export interface PromoteResult {
  type: 'PROMOTE';
  payload: CapabilityPromotedPayload;
}

export interface DemoteResult {
  type: 'DEMOTE';
  payload: CapabilityDemotedPayload;
}

export interface MergeResult {
  type: 'MERGE';
  payload: CapabilityMergedPayload;
}

export interface RetireResult {
  type: 'RETIRE';
  payload: CapabilityRetiredPayload;
}

export interface DeleteResult {
  type: 'DELETE';
  payload: CapabilityDeletedPayload;
}

export type StructuralOpResult =
  | ReparentResult
  | PromoteResult
  | DemoteResult
  | MergeResult
  | RetireResult
  | DeleteResult;

// ─── Prisma transaction client alias ─────────────────────────────────────────

type TxClient = Prisma.TransactionClient;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class StructuralOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: DomainEventBus,
    private readonly capabilityVersionService: CapabilityVersionService,
  ) {}

  // ── REPARENT ───────────────────────────────────────────────────────────────

  /**
   * Move `capabilityId` under a new parent.
   *
   * Validations:
   * - Capability must exist (it is already locked by the CR).
   * - New parent must exist if provided.
   * - New parent must not be the capability itself (self-parent).
   * - New parent must not be a descendant of the capability (circular ref).
   *
   * Breadcrumbs/paths are derived dynamically from the parent chain so no
   * denormalised path columns need to be updated.
   */
  async applyReparent(
    changeRequestId: string,
    capabilityId: string,
    rawPayload: Prisma.JsonValue | null,
    actorId: string,
    tx: TxClient,
  ): Promise<ReparentResult> {
    const payload = this.parsePayload<ReparentPayload>(rawPayload, changeRequestId);
    const newParentId = payload?.newParentId ?? null;

    const capability = await tx.capability.findUnique({
      where: { id: capabilityId },
      select: { id: true, parentId: true },
    });
    if (!capability) {
      throw new NotFoundException(`Capability "${capabilityId}" not found`);
    }

    const oldParentId = capability.parentId;

    if (newParentId) {
      if (newParentId === capabilityId) {
        throw new BadRequestException('A capability cannot be its own parent');
      }

      const parent = await tx.capability.findUnique({
        where: { id: newParentId },
        select: { id: true },
      });
      if (!parent) {
        throw new NotFoundException(`Target parent capability "${newParentId}" not found`);
      }

      // Circular-reference guard: walk up from newParentId; if we hit
      // capabilityId it means newParentId is a descendant of the capability.
      await this.assertNotDescendant(capabilityId, newParentId, tx);
    }

    const beforeSnap = await tx.capability.findUnique({ where: { id: capabilityId } });

    await tx.capability.update({
      where: { id: capabilityId },
      data: { parentId: newParentId },
    });

    const afterSnap = await tx.capability.findUnique({ where: { id: capabilityId } });

    await this.capabilityVersionService.recordChange(tx, {
      capabilityId,
      changeType: CapabilityVersionChangeType.REPARENT,
      beforeSnapshot: beforeSnap as unknown as Record<string, unknown>,
      afterSnapshot: afterSnap as unknown as Record<string, unknown>,
      changedBy: actorId,
    });

    return {
      type: 'REPARENT',
      payload: {
        capabilityId,
        oldParentId,
        newParentId,
        changeRequestId,
        actorId,
        occurredAt: new Date(),
      },
    };
  }

  // ── PROMOTE ────────────────────────────────────────────────────────────────

  /**
   * Promote a LEAF capability to ABSTRACT.
   *
   * Validations:
   * - Capability must be LEAF (idempotent check — promotes only once).
   */
  async applyPromote(
    changeRequestId: string,
    capabilityId: string,
    actorId: string,
    tx: TxClient,
  ): Promise<PromoteResult> {
    const capability = await tx.capability.findUnique({
      where: { id: capabilityId },
      select: { id: true, type: true },
    });
    if (!capability) {
      throw new NotFoundException(`Capability "${capabilityId}" not found`);
    }
    if (capability.type !== CapabilityType.LEAF) {
      throw new BadRequestException(
        `Capability "${capabilityId}" is already ABSTRACT and cannot be promoted`,
      );
    }

    const beforeSnapPromote = await tx.capability.findUnique({ where: { id: capabilityId } });

    await tx.capability.update({
      where: { id: capabilityId },
      data: { type: CapabilityType.ABSTRACT },
    });

    const afterSnapPromote = await tx.capability.findUnique({ where: { id: capabilityId } });

    await this.capabilityVersionService.recordChange(tx, {
      capabilityId,
      changeType: CapabilityVersionChangeType.PROMOTE,
      beforeSnapshot: beforeSnapPromote as unknown as Record<string, unknown>,
      afterSnapshot: afterSnapPromote as unknown as Record<string, unknown>,
      changedBy: actorId,
    });

    return {
      type: 'PROMOTE',
      payload: { capabilityId, changeRequestId, actorId, occurredAt: new Date() },
    };
  }

  // ── DEMOTE ─────────────────────────────────────────────────────────────────

  /**
   * Demote an ABSTRACT capability to LEAF.
   *
   * Validations:
   * - Capability must be ABSTRACT.
   * - Capability must have no children — a non-leaf node with children cannot
   *   be made a leaf without orphaning or re-parenting them first.
   */
  async applyDemote(
    changeRequestId: string,
    capabilityId: string,
    actorId: string,
    tx: TxClient,
  ): Promise<DemoteResult> {
    const capability = await tx.capability.findUnique({
      where: { id: capabilityId },
      select: { id: true, type: true },
    });
    if (!capability) {
      throw new NotFoundException(`Capability "${capabilityId}" not found`);
    }
    if (capability.type !== CapabilityType.ABSTRACT) {
      throw new BadRequestException(
        `Capability "${capabilityId}" is already LEAF and cannot be demoted`,
      );
    }

    const childCount = await tx.capability.count({
      where: { parentId: capabilityId },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        `Capability "${capabilityId}" has ${childCount} child capability(ies) and cannot be demoted to LEAF. ` +
          `Re-parent or remove the children first.`,
      );
    }

    const beforeSnapDemote = await tx.capability.findUnique({ where: { id: capabilityId } });

    await tx.capability.update({
      where: { id: capabilityId },
      data: { type: CapabilityType.LEAF },
    });

    const afterSnapDemote = await tx.capability.findUnique({ where: { id: capabilityId } });

    await this.capabilityVersionService.recordChange(tx, {
      capabilityId,
      changeType: CapabilityVersionChangeType.DEMOTE,
      beforeSnapshot: beforeSnapDemote as unknown as Record<string, unknown>,
      afterSnapshot: afterSnapDemote as unknown as Record<string, unknown>,
      changedBy: actorId,
    });

    return {
      type: 'DEMOTE',
      payload: { capabilityId, changeRequestId, actorId, occurredAt: new Date() },
    };
  }

  // ── MERGE ──────────────────────────────────────────────────────────────────

  /**
   * Merge one or more source capabilities into a surviving capability.
   *
   * For each source capability:
   *  1. Re-parent its direct children to the survivor.
   *  2. Transfer all its mappings to the survivor.
   *  3. Merge aliases, tags, and sourceReferences into the survivor (deduped).
   *  4. Retire the source with a traceable rationale referencing the survivor.
   *
   * The survivor's own fields (description, domain, steward, etc.) are
   * preserved unchanged — the curator controlled those when creating the CR.
   *
   * Validations:
   * - operationPayload.survivorCapabilityId is required.
   * - Survivor must exist and not be RETIRED.
   * - All sources (affectedCapabilityIds minus survivor) must exist.
   * - Survivor must not appear in the source list.
   */
  async applyMerge(
    changeRequestId: string,
    affectedCapabilityIds: string[],
    rawPayload: Prisma.JsonValue | null,
    actorId: string,
    tx: TxClient,
  ): Promise<MergeResult> {
    const payload = this.parsePayload<MergePayload>(rawPayload, changeRequestId);
    if (!payload?.survivorCapabilityId) {
      throw new BadRequestException(
        `MERGE change request "${changeRequestId}" is missing operationPayload.survivorCapabilityId`,
      );
    }

    const survivorId = payload.survivorCapabilityId;
    const sourceIds = affectedCapabilityIds.filter((id) => id !== survivorId);

    if (sourceIds.length === 0) {
      throw new BadRequestException(
        `MERGE requires at least one source capability distinct from the survivor`,
      );
    }

    // Validate survivor
    const survivor = await tx.capability.findUnique({
      where: { id: survivorId },
      select: { id: true, lifecycleStatus: true, aliases: true, tags: true, sourceReferences: true },
    });
    if (!survivor) {
      throw new NotFoundException(`Survivor capability "${survivorId}" not found`);
    }
    if (survivor.lifecycleStatus === LifecycleStatus.RETIRED) {
      throw new BadRequestException(`Survivor capability "${survivorId}" is already RETIRED`);
    }

    // Validate all sources exist
    const sources = await tx.capability.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, lifecycleStatus: true, aliases: true, tags: true, sourceReferences: true },
    });
    const foundSourceIds = new Set(sources.map((s) => s.id));
    const missingSourceIds = sourceIds.filter((id) => !foundSourceIds.has(id));
    if (missingSourceIds.length > 0) {
      throw new NotFoundException(
        `Source capabilities not found: ${missingSourceIds.join(', ')}`,
      );
    }

    // Guard: survivor must not be a descendant of any source capability.
    // If survivor is a child (or deeper) of a source, setting that source's
    // children's parentId to survivorId would make survivor its own ancestor.
    for (const source of sources) {
      await this.assertNotDescendant(source.id, survivorId, tx);
    }

    let transferredChildCount = 0;
    let transferredMappingCount = 0;

    // Accumulate metadata to merge into survivor
    const mergedAliases = new Set(survivor.aliases);
    const mergedTags = new Set(survivor.tags);
    const mergedSourceRefs = new Set(survivor.sourceReferences);

    for (const source of sources) {
      // 1. Re-parent children
      const reParentResult = await tx.capability.updateMany({
        where: { parentId: source.id },
        data: { parentId: survivorId },
      });
      transferredChildCount += reParentResult.count;

      // 2. Transfer mappings
      const transferResult = await tx.mapping.updateMany({
        where: { capabilityId: source.id },
        data: { capabilityId: survivorId },
      });
      transferredMappingCount += transferResult.count;

      // 3. Accumulate metadata
      for (const alias of source.aliases) mergedAliases.add(alias);
      for (const tag of source.tags) mergedTags.add(tag);
      for (const ref of source.sourceReferences) mergedSourceRefs.add(ref);

      // 4. Capture before-snapshot, retire the source, capture after-snapshot
      const mergeBeforeSnap = await tx.capability.findUnique({ where: { id: source.id } });
      const retireRationale = `Merged into capability ${survivorId} via change request ${changeRequestId}`;
      await tx.capability.update({
        where: { id: source.id },
        data: {
          lifecycleStatus: LifecycleStatus.RETIRED,
          effectiveTo: new Date(),
          rationale: retireRationale,
        },
      });
      const mergeAfterSnap = await tx.capability.findUnique({ where: { id: source.id } });

      await this.capabilityVersionService.recordChange(tx, {
        capabilityId: source.id,
        changeType: CapabilityVersionChangeType.MERGE,
        beforeSnapshot: mergeBeforeSnap as unknown as Record<string, unknown>,
        afterSnapshot: mergeAfterSnap as unknown as Record<string, unknown>,
        changedBy: actorId,
      });
    }

    // Capture survivor before-snapshot, update with merged metadata, capture after-snapshot
    const survivorBeforeSnap = await tx.capability.findUnique({ where: { id: survivorId } });
    await tx.capability.update({
      where: { id: survivorId },
      data: {
        aliases: [...mergedAliases],
        tags: [...mergedTags],
        sourceReferences: [...mergedSourceRefs],
      },
    });
    const survivorAfterSnap = await tx.capability.findUnique({ where: { id: survivorId } });

    await this.capabilityVersionService.recordChange(tx, {
      capabilityId: survivorId,
      changeType: CapabilityVersionChangeType.MERGE,
      beforeSnapshot: survivorBeforeSnap as unknown as Record<string, unknown>,
      afterSnapshot: survivorAfterSnap as unknown as Record<string, unknown>,
      changedBy: actorId,
    });

    return {
      type: 'MERGE',
      payload: {
        survivorCapabilityId: survivorId,
        retiredSourceIds: sourceIds,
        transferredChildCount,
        transferredMappingCount,
        changeRequestId,
        actorId,
        occurredAt: new Date(),
      },
    };
  }

  // ── RETIRE ─────────────────────────────────────────────────────────────────

  /**
   * Retire one or more capabilities.
   *
   * Actions:
   * - Set lifecycleStatus = RETIRED and effectiveTo on each capability.
   * - Rationale comes from the top-level ChangeRequest.rationale (required
   *   at CR creation).
   * - Flag all ACTIVE mappings for each retired capability as INACTIVE so
   *   downstream consumers can handle the gap.
   *
   * Validations:
   * - Each capability must exist.
   * - None may already be RETIRED (prevents no-op / double-retire).
   */
  async applyRetire(
    changeRequestId: string,
    affectedCapabilityIds: string[],
    rawPayload: Prisma.JsonValue | null,
    actorId: string,
    tx: TxClient,
  ): Promise<RetireResult> {
    const payload = this.parsePayload<RetirePayload>(rawPayload, changeRequestId);
    const effectiveTo = payload?.effectiveTo ? new Date(payload.effectiveTo) : new Date();

    if (payload?.effectiveTo && isNaN(effectiveTo.getTime())) {
      throw new BadRequestException(
        `operationPayload.effectiveTo "${payload.effectiveTo}" is not a valid ISO-8601 date string`,
      );
    }

    // Validate all exist and none already RETIRED
    const capabilities = await tx.capability.findMany({
      where: { id: { in: affectedCapabilityIds } },
      select: { id: true, lifecycleStatus: true },
    });
    const foundIds = new Set(capabilities.map((c) => c.id));
    const missingIds = affectedCapabilityIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundException(`Capabilities not found: ${missingIds.join(', ')}`);
    }

    const alreadyRetiredIds = capabilities
      .filter((c) => c.lifecycleStatus === LifecycleStatus.RETIRED)
      .map((c) => c.id);
    if (alreadyRetiredIds.length > 0) {
      throw new BadRequestException(
        `The following capabilities are already RETIRED: ${alreadyRetiredIds.join(', ')}`,
      );
    }

    // Validate none of the capabilities being retired have children.
    // Retiring a parent while leaving children with a RETIRED parent creates
    // orphaned branches — re-parent or retire children first.
    const childCount = await tx.capability.count({
      where: { parentId: { in: affectedCapabilityIds } },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        `One or more capabilities being retired have children. ` +
          `Re-parent or retire the children first.`,
      );
    }

    // Capture before-snapshots from the already-fetched capabilities (avoids a second findMany)
    const retireBeforeMap = new Map(capabilities.map((c) => [c.id, c]));

    // Retire capabilities
    await tx.capability.updateMany({
      where: { id: { in: affectedCapabilityIds } },
      data: {
        lifecycleStatus: LifecycleStatus.RETIRED,
        effectiveTo,
      },
    });

    // Capture after-snapshots and record version entries per capability
    for (const capabilityId of affectedCapabilityIds) {
      const beforeSnap = retireBeforeMap.get(capabilityId);
      const afterSnap = await tx.capability.findUnique({ where: { id: capabilityId } });

      await this.capabilityVersionService.recordChange(tx, {
        capabilityId,
        changeType: CapabilityVersionChangeType.RETIRE,
        beforeSnapshot: beforeSnap as unknown as Record<string, unknown>,
        afterSnapshot: afterSnap as unknown as Record<string, unknown>,
        changedBy: actorId,
      });
    }

    // Flag active mappings as INACTIVE
    const affectedMappings = await tx.mapping.findMany({
      where: {
        capabilityId: { in: affectedCapabilityIds },
        state: MappingState.ACTIVE,
      },
      select: { id: true },
    });
    const flaggedMappingIds = affectedMappings.map((m) => m.id);

    if (flaggedMappingIds.length > 0) {
      await tx.mapping.updateMany({
        where: { id: { in: flaggedMappingIds } },
        data: { state: MappingState.INACTIVE },
      });
    }

    return {
      type: 'RETIRE',
      payload: {
        retiredCapabilityIds: affectedCapabilityIds,
        flaggedMappingIds,
        effectiveTo,
        changeRequestId,
        actorId,
        occurredAt: new Date(),
      },
    };
  }

  // ── DELETE (hard) ──────────────────────────────────────────────────────────

  /**
   * Hard-delete a capability.
   *
   * Only DRAFT capabilities with no children may be hard-deleted.  This
   * prevents accidental destruction of governed or active capabilities.
   *
   * Validations:
   * - Exactly one affectedCapabilityId (bulk hard-delete is not supported).
   * - Capability must be in DRAFT lifecycle status OR explicitly flagged as erroneous
   *   (isErroneous === true).  The erroneous path allows removal of capabilities that
   *   were published by mistake, without requiring a full lifecycle rollback first.
   * - Capability must have no children.
   */
  async applyDelete(
    changeRequestId: string,
    affectedCapabilityIds: string[],
    actorId: string,
    tx: TxClient,
  ): Promise<DeleteResult> {
    if (affectedCapabilityIds.length !== 1) {
      throw new BadRequestException(
        `DELETE change request must target exactly one capability; got ${affectedCapabilityIds.length}`,
      );
    }

    const capabilityId = affectedCapabilityIds[0];
    const capability = await tx.capability.findUnique({
      where: { id: capabilityId },
      select: { id: true, lifecycleStatus: true, isErroneous: true },
    });
    if (!capability) {
      throw new NotFoundException(`Capability "${capabilityId}" not found`);
    }

    const deletionPermitted =
      capability.lifecycleStatus === LifecycleStatus.DRAFT || capability.isErroneous === true;

    if (!deletionPermitted) {
      throw new BadRequestException(
        `Only DRAFT capabilities or those explicitly flagged as erroneous may be hard-deleted; ` +
          `"${capabilityId}" has status "${capability.lifecycleStatus}" and isErroneous=false`,
      );
    }

    const childCount = await tx.capability.count({
      where: { parentId: capabilityId },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        `Capability "${capabilityId}" has ${childCount} children and cannot be hard-deleted. ` +
          `Re-parent or remove the children first.`,
      );
    }

    // Delete related records that have FK constraints to capability (no cascade in schema):
    // 1. CapabilityVersion rows — version history for this capability
    await tx.capabilityVersion.deleteMany({ where: { capabilityId } });
    // 2. CapabilityLock for this capability — must be deleted here since the capability
    //    is about to be removed (the lock record has a non-cascading FK to capability).
    //    The CR's other locks are still cleaned up by ChangeRequestService after the op.
    await tx.capabilityLock.deleteMany({ where: { capabilityId } });
    // 3. Mappings
    await tx.mapping.deleteMany({ where: { capabilityId } });
    // 4. Capability itself
    await tx.capability.delete({ where: { id: capabilityId } });

    return {
      type: 'DELETE',
      payload: { capabilityId, changeRequestId, actorId, occurredAt: new Date() },
    };
  }

  // ── Domain event emission ──────────────────────────────────────────────────

  /**
   * Emit the appropriate domain event AFTER the transaction that produced
   * `result` has committed.  Called by ChangeRequestService.
   */
  emitDomainEvent(result: StructuralOpResult): void {
    switch (result.type) {
      case 'REPARENT':
        this.eventBus.emitCapabilityReparented(result.payload);
        break;
      case 'PROMOTE':
        this.eventBus.emitCapabilityPromoted(result.payload);
        break;
      case 'DEMOTE':
        this.eventBus.emitCapabilityDemoted(result.payload);
        break;
      case 'MERGE':
        this.eventBus.emitCapabilityMerged(result.payload);
        break;
      case 'RETIRE':
        this.eventBus.emitCapabilityRetired(result.payload);
        break;
      case 'DELETE':
        this.eventBus.emitCapabilityDeleted(result.payload);
        break;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Walk up the ancestor chain of `ancestorCandidateId`.  If we encounter
   * `capabilityId` then `ancestorCandidateId` is a descendant of
   * `capabilityId`, which would create a circular reference if we made
   * `ancestorCandidateId` the parent of `capabilityId`.
   */
  private async assertNotDescendant(
    capabilityId: string,
    ancestorCandidateId: string,
    tx: TxClient,
  ): Promise<void> {
    let currentId: string | null = ancestorCandidateId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === capabilityId) {
        throw new BadRequestException(
          'A capability cannot be re-parented under one of its own descendants ' +
            '(circular reference)',
        );
      }

      if (visited.has(currentId)) {
        // Pre-existing circular ref in data — surface rather than loop forever.
        throw new BadRequestException(
          'Capability hierarchy contains an existing circular parent relationship',
        );
      }

      visited.add(currentId);

      const row: { parentId: string | null } | null = await tx.capability.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      currentId = row?.parentId ?? null;
    }
  }

  /**
   * Parse the raw JSON payload stored in ChangeRequest.operationPayload.
   * Returns null if the payload is absent — callers must decide whether
   * that is acceptable for their operation type.
   */
  private parsePayload<T>(
    raw: Prisma.JsonValue | null,
    changeRequestId: string,
  ): T | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException(
        `operationPayload for change request "${changeRequestId}" must be a JSON object`,
      );
    }
    return raw as unknown as T;
  }
}
