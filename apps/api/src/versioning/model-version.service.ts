/**
 * ModelVersionService
 *
 * Manages the ModelVersion lifecycle:
 *  - getOrCreateDraft: get (or bootstrap) the current MAIN DRAFT
 *  - publishSnapshot: promote DRAFT → PUBLISHED and open a new DRAFT
 *  - rollback: create a new DRAFT that reverts capabilities to a prior published state
 *  - computeDiff: compare capability changes between two ModelVersions
 *  - listVersions / findById: read-side queries
 *
 * Invariants enforced:
 *  - Exactly one MAIN DRAFT at a time (partial unique index in DB)
 *  - At most one MAIN PUBLISHED at a time; old PUBLISHED → ROLLED_BACK on new publish
 *  - PUBLISHED versions are read-only (no capability mutations can target them)
 */

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  BranchType,
  CapabilityVersionChangeType,
  ModelVersionState,
  Prisma,
  type Capability,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublishEventService } from '../integration/publish-event.service';
import { CapabilityVersionService } from './capability-version.service';
import { AuditService } from '../audit/audit.service';
import {
  DomainEventBus,
  MODEL_VERSION_PUBLISHED,
  MODEL_VERSION_ROLLED_BACK,
} from '../structural-ops/events/capability-domain-events';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CapabilityDiffEntry {
  capabilityId: string;
  name: string;
  changedFields?: unknown;
  afterSnapshot?: unknown;
  beforeSnapshot?: unknown;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ModelVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilityVersionService: CapabilityVersionService,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => PublishEventService))
    private readonly publishEventService: PublishEventService,
    @Inject(forwardRef(() => DomainEventBus))
    private readonly eventBus: DomainEventBus,
  ) {}

  // ── Read helpers ──────────────────────────────────────────────────────────

  async getCurrentDraft() {
    return this.prisma.modelVersion.findFirst({
      where: { state: ModelVersionState.DRAFT, branchType: BranchType.MAIN },
    });
  }

  async getOrCreateDraft(actorId: string) {
    const existing = await this.getCurrentDraft();
    if (existing) return existing;

    return this.prisma.modelVersion.create({
      data: {
        versionLabel: `draft-${Date.now()}`,
        state: ModelVersionState.DRAFT,
        branchType: BranchType.MAIN,
        createdBy: actorId,
      },
    });
  }

  async findById(id: string) {
    const version = await this.prisma.modelVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException(`ModelVersion with ID "${id}" not found`);
    return version;
  }

  async listVersions(branchType: BranchType = BranchType.MAIN) {
    const items = await this.prisma.modelVersion.findMany({
      where: { branchType },
      orderBy: { createdAt: 'desc' },
    });
    return { items, total: items.length };
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  /**
   * Publish the current MAIN DRAFT as a named snapshot.
   *
   * Sequence:
   * 1. Archive any existing MAIN PUBLISHED → ROLLED_BACK (satisfies unique index).
   * 2. Promote current DRAFT → PUBLISHED with the supplied label.
   * 3. Create a new empty DRAFT for future edits (baseVersionId = just-published id).
   */
  async publishSnapshot(dto: {
    versionLabel: string;
    description?: string;
    notes?: string;
    approvedBy?: string;
    actorId: string;
  }) {
    let publishedVersionId!: string;
    let newDraftId!: string;

    await this.prisma.$transaction(async (tx) => {
      const publishEventRecorder = this.publishEventService.forClient(tx);

      // Re-read draft inside the transaction to eliminate TOCTOU races.
      const draft = await tx.modelVersion.findFirst({
        where: { state: ModelVersionState.DRAFT, branchType: BranchType.MAIN },
        select: { id: true },
      });
      if (!draft) {
        throw new BadRequestException('No active DRAFT version found. Nothing to publish.');
      }

      // Guard: label must not already be taken by a *different* version
      const labelConflict = await tx.modelVersion.findUnique({
        where: { versionLabel: dto.versionLabel },
        select: { id: true },
      });
      if (labelConflict && labelConflict.id !== draft.id) {
        throw new ConflictException(`Version label "${dto.versionLabel}" is already in use`);
      }

      // 1. Archive existing PUBLISHED → ROLLED_BACK
      await tx.modelVersion.updateMany({
        where: { state: ModelVersionState.PUBLISHED, branchType: BranchType.MAIN },
        data: { state: ModelVersionState.ROLLED_BACK },
      });

      // 2. Promote DRAFT → PUBLISHED
      await tx.modelVersion.update({
        where: { id: draft.id },
        data: {
          state: ModelVersionState.PUBLISHED,
          versionLabel: dto.versionLabel,
          description: dto.description ?? null,
          notes: dto.notes ?? null,
          approvedBy: dto.approvedBy ?? null,
          publishedAt: new Date(),
        },
      });
      publishedVersionId = draft.id;

      // 3. Create new DRAFT
      const newDraft = await tx.modelVersion.create({
        data: {
          versionLabel: `draft-${Date.now()}`,
          state: ModelVersionState.DRAFT,
          branchType: BranchType.MAIN,
          createdBy: dto.actorId,
          baseVersionId: draft.id,
        },
        select: { id: true },
      });
      newDraftId = newDraft.id;

      await publishEventRecorder.recordModelVersionEvent({
        eventType: MODEL_VERSION_PUBLISHED,
        modelVersionId: draft.id,
        entityId: draft.id,
        payloadRef: `model-version/${draft.id}`,
      });
    });

    const result = {
      published: await this.findById(publishedVersionId),
      newDraft: await this.findById(newDraftId),
    };

    // Generic audit trail – fire-and-forget
    void this.auditService.record({
      entityType: AuditEntityType.MODEL_VERSION,
      entityId: publishedVersionId,
      action: AuditAction.PUBLISH,
      actorId: dto.actorId,
      after: {
        versionLabel: dto.versionLabel,
        state: ModelVersionState.PUBLISHED,
        newDraftId,
      },
    });

    this.eventBus.emitModelVersionPublished({
      modelVersionId: publishedVersionId,
      versionLabel: result.published.versionLabel,
      actorId: dto.actorId,
      newDraftId,
      occurredAt: result.published.publishedAt ?? new Date(),
    });

    return result;
  }

  // ── Rollback ──────────────────────────────────────────────────────────────

  /**
   * Create a new MAIN DRAFT that reverts capabilities to a prior published state.
   *
   * Preconditions:
   * - Target version must be PUBLISHED or ROLLED_BACK.
   * - No active DRAFT may exist (caller must publish or discard first).
   *
   * For each capability that had a different state at the target version, the
   * service applies the snapshot reversion and records a CapabilityVersion
   * entry (changeType=UPDATE) in the new draft.
   */
  async rollback(dto: {
    rollbackOfVersionId: string;
    createdBy: string;
    notes?: string;
  }) {
    const targetVersion = await this.findById(dto.rollbackOfVersionId);

    if (
      targetVersion.state !== ModelVersionState.PUBLISHED &&
      targetVersion.state !== ModelVersionState.ROLLED_BACK
    ) {
      throw new BadRequestException(
        `Can only rollback to a PUBLISHED or ROLLED_BACK version; ` +
          `"${dto.rollbackOfVersionId}" has state "${targetVersion.state}"`,
      );
    }

    const existingDraft = await this.getCurrentDraft();
    if (existingDraft) {
      throw new ConflictException(
        'An active DRAFT already exists. Publish or discard it before rolling back.',
      );
    }

    const capabilityStates = await this.buildCapabilityStateAtVersion(dto.rollbackOfVersionId);

    let newDraftId!: string;

    await this.prisma.$transaction(async (tx) => {
      const publishEventRecorder = this.publishEventService.forClient(tx);

      // Create the new rollback draft
      const newDraft = await tx.modelVersion.create({
        data: {
          versionLabel: `rollback-draft-${Date.now()}`,
          state: ModelVersionState.DRAFT,
          branchType: BranchType.MAIN,
          createdBy: dto.createdBy,
          notes: dto.notes ?? null,
          rollbackOfVersionId: dto.rollbackOfVersionId,
          baseVersionId: dto.rollbackOfVersionId,
        },
        select: { id: true },
      });
      newDraftId = newDraft.id;

      for (const { capabilityId, targetSnapshot } of capabilityStates) {
        const current = await tx.capability.findUnique({ where: { id: capabilityId } });
        if (!current) continue;

        const currentSnapshot = this.capabilityToSnapshot(current);

        if (!targetSnapshot) {
          // Capability didn't exist at target version (was created later).
          // Reverting it would require deletion — skip in Phase 6A.
          continue;
        }

        const targetSnap = targetSnapshot as Record<string, unknown>;
        const changedFields = this.capabilityVersionService.computeChangedFields(
          currentSnapshot,
          targetSnap,
        );

        // Nothing to revert for this capability
        if (Object.keys(changedFields).length === 0) continue;

        const updateData = this.buildCapabilityUpdateFromSnapshot(targetSnap);
        await tx.capability.update({
          where: { id: capabilityId },
          data: updateData,
        });

        const afterCap = await tx.capability.findUnique({ where: { id: capabilityId } });
        const afterSnapshot = afterCap ? this.capabilityToSnapshot(afterCap) : null;

        // Find previous version for chain
        const prevCv = await tx.capabilityVersion.findFirst({
          where: { capabilityId },
          orderBy: { changedAt: 'desc' },
          select: { id: true },
        });

        await tx.capabilityVersion.create({
          data: {
            capabilityId,
            modelVersionId: newDraftId,
            changeType: CapabilityVersionChangeType.UPDATE,
            changedFields: changedFields as Prisma.InputJsonValue,
            beforeSnapshot: currentSnapshot as Prisma.InputJsonValue,
            afterSnapshot:
              afterSnapshot !== null
                ? (afterSnapshot as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            changedBy: dto.createdBy,
            previousVersionId: prevCv?.id ?? null,
          },
        });
      }

      await publishEventRecorder.recordModelVersionEvent({
        eventType: MODEL_VERSION_ROLLED_BACK,
        modelVersionId: newDraftId,
        entityId: newDraftId,
        payloadRef: `rollback/${dto.rollbackOfVersionId}`,
      });
    });

    const newDraft = await this.findById(newDraftId);

    // Generic audit trail – fire-and-forget
    void this.auditService.record({
      entityType: AuditEntityType.MODEL_VERSION,
      entityId: newDraftId,
      action: AuditAction.ROLLBACK,
      actorId: dto.createdBy,
      metadata: {
        rollbackOfVersionId: dto.rollbackOfVersionId,
        notes: dto.notes ?? null,
      },
    });

    this.eventBus.emitModelVersionRolledBack({
      modelVersionId: newDraftId,
      rollbackOfVersionId: dto.rollbackOfVersionId,
      actorId: dto.createdBy,
      occurredAt: newDraft.createdAt,
    });

    return newDraft;
  }

  // ── Diff ──────────────────────────────────────────────────────────────────

  /**
   * Compute a diff between two ModelVersions.
   *
   * Walks the version lineage chain from `fromVersionId` to `toVersionId`,
   * collects all CapabilityVersion entries in that range, and classifies
   * each capability as added / modified / removed.
   *
   * Falls back to a direct comparison of the two versions' CapabilityVersion
   * rows when they are not in the same lineage chain.
   */
  async computeDiff(fromVersionId: string, toVersionId: string) {
    const [fromVersion, toVersion] = await Promise.all([
      this.findById(fromVersionId),
      this.findById(toVersionId),
    ]);

    // Get IDs in the range (from excluded, to included) via lineage walk
    const lineage = await this.getVersionLineageRange(fromVersionId, toVersionId);

    // Determine whether fromVersionId is actually an ancestor of toVersionId.
    const fromInLineage = lineage.includes(fromVersionId);

    // Exclude fromVersion itself (it's the baseline); use only the delta range.
    const rangeIds = lineage.filter((id) => id !== fromVersionId);

    // If from is not an ancestor, fall back to showing only changes IN toVersion
    // (can't do a meaningful cross-lineage diff without snapshot reconstruction).
    const queryIds = fromInLineage && rangeIds.length > 0 ? rangeIds : [toVersionId];

    const capabilityVersions = await this.prisma.capabilityVersion.findMany({
      where: { modelVersionId: { in: queryIds } },
      orderBy: { changedAt: 'asc' },
      include: {
        capability: { select: { id: true, uniqueName: true } },
      },
    });

    // Group by capabilityId
    const byCapability = new Map<string, typeof capabilityVersions>();
    for (const cv of capabilityVersions) {
      const bucket = byCapability.get(cv.capabilityId) ?? [];
      bucket.push(cv);
      byCapability.set(cv.capabilityId, bucket);
    }

    const added: CapabilityDiffEntry[] = [];
    const removed: CapabilityDiffEntry[] = [];
    const modified: CapabilityDiffEntry[] = [];

    for (const [capabilityId, changes] of byCapability) {
      const first = changes[0];
      const last = changes[changes.length - 1];

      if (first.changeType === CapabilityVersionChangeType.CREATE && last.changeType !== CapabilityVersionChangeType.DELETE) {
        added.push({
          capabilityId,
          name: first.capability.uniqueName,
          afterSnapshot: last.afterSnapshot,
        });
      } else if (last.changeType === CapabilityVersionChangeType.DELETE) {
        removed.push({
          capabilityId,
          name: last.capability.uniqueName,
          // Use the DELETE row's beforeSnapshot — that is the final state before removal.
          beforeSnapshot: last.beforeSnapshot,
        });
      } else {
        // Aggregate all changed fields across the range
        const allChangedFields = changes.reduce<Record<string, unknown>>(
          (acc, cv) => ({ ...acc, ...(cv.changedFields as Record<string, unknown>) }),
          {},
        );
        modified.push({
          capabilityId,
          name: first.capability.uniqueName,
          changedFields: allChangedFields,
        });
      }
    }

    return {
      fromVersion: {
        id: fromVersion.id,
        versionLabel: fromVersion.versionLabel,
        state: fromVersion.state,
      },
      toVersion: {
        id: toVersion.id,
        versionLabel: toVersion.versionLabel,
        state: toVersion.state,
      },
      added,
      modified,
      removed,
      summary: {
        addedCount: added.length,
        modifiedCount: modified.length,
        removedCount: removed.length,
      },
    };
  }

  // ── Public helpers ────────────────────────────────────────────────────────

  /**
   * Reconstruct the full capability set at a given ModelVersion.
   *
   * Exposed publicly so that WhatIfBranchService can project the base-version
   * state when computing branch capability projections, without re-implementing
   * the snapshot-reconstruction logic.
   *
   * Returns a map of capabilityId → lastKnownSnapshot (null = capability was
   * deleted at or before that version).
   */
  async getCapabilityStateAtVersion(
    versionId: string,
  ): Promise<Map<string, Record<string, unknown> | null>> {
    const pairs = await this.buildCapabilityStateAtVersion(versionId);
    const map = new Map<string, Record<string, unknown> | null>();
    for (const { capabilityId, targetSnapshot } of pairs) {
      map.set(capabilityId, (targetSnapshot as Record<string, unknown> | null) ?? null);
    }
    return map;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Walk backwards from `toId` via `baseVersionId` until we reach `fromId`
   * or the chain ends.  Returns IDs in chronological order (oldest first).
   *
   * Guards against corrupted cycles (visited set) and excessively deep chains
   * (MAX_LINEAGE_DEPTH) to prevent infinite loops / connection pool exhaustion.
   */
  private async getVersionLineageRange(fromId: string, toId: string): Promise<string[]> {
    const MAX_LINEAGE_DEPTH = 1000;
    const visited = new Set<string>();
    const ids: string[] = [];
    let currentId: string | null = toId;
    let depth = 0;

    while (currentId) {
      if (visited.has(currentId) || depth >= MAX_LINEAGE_DEPTH) break;
      visited.add(currentId);
      depth++;

      const versionRow: { id: string; baseVersionId: string | null } | null =
        await this.prisma.modelVersion.findUnique({
          where: { id: currentId },
          select: { id: true, baseVersionId: true },
        });

      if (!versionRow) break;
      ids.push(versionRow.id);

      if (versionRow.id === fromId) break;
      currentId = versionRow.baseVersionId;
    }

    return ids.reverse(); // oldest first
  }

  /**
   * Build a map of capabilityId → last-known snapshot for the given published version.
   * Uses all CapabilityVersion rows for versions up to and including the target.
   */
  private async buildCapabilityStateAtVersion(
    versionId: string,
  ): Promise<Array<{ capabilityId: string; targetSnapshot: unknown }>> {
    const targetVersion = await this.prisma.modelVersion.findUnique({
      where: { id: versionId },
      select: { publishedAt: true, createdAt: true },
    });

    const cutoff = targetVersion?.publishedAt ?? targetVersion?.createdAt ?? new Date();

    // Find all versions on MAIN at or before the cutoff (plus the target itself)
    const versionsAtOrBefore = await this.prisma.modelVersion.findMany({
      where: {
        branchType: BranchType.MAIN,
        OR: [{ publishedAt: { lte: cutoff } }, { id: versionId }],
      },
      select: { id: true },
    });

    const versionIds = versionsAtOrBefore.map((v) => v.id);

    if (versionIds.length === 0) return [];

    // Get all capability versions in those model versions, most recent first
    const allCvs = await this.prisma.capabilityVersion.findMany({
      where: { modelVersionId: { in: versionIds } },
      orderBy: { changedAt: 'desc' },
      select: {
        capabilityId: true,
        afterSnapshot: true,
        changeType: true,
      },
    });

    // De-duplicate: keep last (most-recent) entry per capability
    const seen = new Set<string>();
    const result: Array<{ capabilityId: string; targetSnapshot: unknown }> = [];

    for (const cv of allCvs) {
      if (!seen.has(cv.capabilityId)) {
        seen.add(cv.capabilityId);
        result.push({
          capabilityId: cv.capabilityId,
          targetSnapshot: cv.changeType === CapabilityVersionChangeType.DELETE ? null : cv.afterSnapshot,
        });
      }
    }

    return result;
  }

  /** Serialize a Capability record to a plain snapshot object. */
  private capabilityToSnapshot(capability: Capability): Record<string, unknown> {
    return { ...capability } as unknown as Record<string, unknown>;
  }

  /** Map a snapshot back to Prisma unchecked update input. Handles date fields. */
  private buildCapabilityUpdateFromSnapshot(
    snapshot: Record<string, unknown>,
  ): Prisma.CapabilityUncheckedUpdateInput {
    const allowedScalars = [
      'uniqueName',
      'aliases',
      'description',
      'domain',
      'type',
      'parentId',
      'lifecycleStatus',
      'effectiveFrom',
      'effectiveTo',
      'rationale',
      'sourceReferences',
      'tags',
      'stewardId',
      'stewardDepartment',
      'nameGuardrailOverride',
      'nameGuardrailOverrideRationale',
      'isErroneous',
      'erroneousReason',
    ] as const;

    const update: Record<string, unknown> = {};

    for (const field of allowedScalars) {
      if (!(field in snapshot)) continue;

      const value = snapshot[field as string];

      // DateTime fields arrive as ISO strings in JSON snapshots
      if (field === 'effectiveFrom' || field === 'effectiveTo') {
        update[field] = value ? new Date(value as string) : null;
      } else {
        update[field] = value ?? null;
      }
    }

    return update as Prisma.CapabilityUncheckedUpdateInput;
  }
}
