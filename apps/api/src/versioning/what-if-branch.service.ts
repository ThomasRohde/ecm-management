/**
 * WhatIfBranchService
 *
 * Manages what-if branch lifecycle and capability projections:
 *
 *  - createBranch      : Fork a new WHAT_IF ModelVersion from the current MAIN DRAFT
 *  - listBranches      : Return all WHAT_IF branches
 *  - getBranch         : Fetch a specific WHAT_IF branch by ID
 *  - discardBranch     : Retire a WHAT_IF branch (sets state → ROLLED_BACK, non-destructive)
 *  - diffVsBase        : Delegate to ModelVersionService.computeDiff(baseVersionId, branchId)
 *
 *  Capability operations (scoped to a branch):
 *  - listCapabilities  : Project the capability state at the branch by overlaying
 *                        WHAT_IF CapabilityVersion entries on top of the base snapshot
 *  - getCapability     : Project a single capability at branch state
 *  - createCapability  : Persist a real Capability row and record a CREATE CapabilityVersion
 *                        scoped to the branch (does NOT touch the MAIN DRAFT)
 *  - updateCapability  : Record an UPDATE CapabilityVersion scoped to the branch;
 *                        the Capability table is intentionally left unchanged
 *  - deleteCapability  : Record a DELETE CapabilityVersion scoped to the branch;
 *                        the Capability row is intentionally left in place
 *
 * Isolation guarantee:
 *   All CapabilityVersion rows created here carry modelVersionId = the branch's
 *   ModelVersion.id (branchType=WHAT_IF).  The MAIN DRAFT ModelVersion is never
 *   mutated by this service.
 *
 * Merge-back:
 *   // TODO(phase6c): merge-back not yet implemented.
 *   When merge-back lands, add a `mergeBranch(branchId, actorId)` method here that
 *   replays the branch's CapabilityVersion entries against the MAIN DRAFT and records
 *   the resulting changes under a new MAIN CapabilityVersion chain.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchType,
  CapabilityVersionChangeType,
  ModelVersionState,
  Prisma,
  type Capability,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilityVersionService } from './capability-version.service';
import { ModelVersionService } from './model-version.service';
import type { BranchCreateCapabilityDto, BranchUpdateCapabilityDto } from './dto/branch-capability.dto';
import type { CreateBranchDto } from './dto/create-branch.dto';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Serialize a Capability record to a plain JSON-safe snapshot. */
function capabilityToSnapshot(cap: Capability): Record<string, unknown> {
  return { ...cap } as unknown as Record<string, unknown>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class WhatIfBranchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilityVersionService: CapabilityVersionService,
    private readonly modelVersionService: ModelVersionService,
  ) {}

  // ── Branch lifecycle ───────────────────────────────────────────────────────

  /**
   * Fork a new WHAT_IF branch from the current MAIN DRAFT.
   *
   * The branch's `baseVersionId` is set to the current MAIN DRAFT's id so that:
   *  - The diff logic can compare what-if changes against the base snapshot.
   *  - Discard simply flips the state without touching MAIN.
   *
   * Preconditions:
   *  - A MAIN DRAFT must exist.
   *  - The requested `branchName` must not already be taken by an active branch.
   *
   * NOTE: The application-level uniqueness check below is best-effort under
   * concurrent requests.  A DB-level partial unique index on
   * (branchType, branchName) WHERE state != 'ROLLED_BACK' would provide full
   * protection — add that index in a follow-up migration.
   * TODO(phase6b-followup): add partial unique index for WHAT_IF branchName.
   */
  async createBranch(dto: CreateBranchDto, actorId: string) {
    const mainDraft = await this.modelVersionService.getCurrentDraft();
    if (!mainDraft) {
      throw new BadRequestException(
        'No active MAIN DRAFT found. A MAIN DRAFT must exist before creating a what-if branch.',
      );
    }

    // Best-effort uniqueness guard (see TODO above for full DB-level protection).
    const existing = await this.prisma.modelVersion.findFirst({
      where: {
        branchType: BranchType.WHAT_IF,
        branchName: dto.branchName,
        state: { not: ModelVersionState.ROLLED_BACK },
      },
    });
    if (existing) {
      throw new ConflictException(
        `A what-if branch named "${dto.branchName}" already exists (id: ${existing.id}).`,
      );
    }

    const branch = await this.prisma.modelVersion.create({
      data: {
        versionLabel: `what-if-${dto.branchName}-${Date.now()}`,
        state: ModelVersionState.DRAFT,
        branchType: BranchType.WHAT_IF,
        branchName: dto.branchName,
        description: dto.description ?? null,
        createdBy: actorId,
        baseVersionId: mainDraft.id,
      },
    });

    return branch;
  }

  /** List all WHAT_IF branches, ordered newest first. */
  async listBranches() {
    const items = await this.prisma.modelVersion.findMany({
      where: { branchType: BranchType.WHAT_IF },
      orderBy: { createdAt: 'desc' },
    });
    return { items, total: items.length };
  }

  /** Get a specific WHAT_IF branch by its ModelVersion id. */
  async getBranch(branchId: string) {
    const branch = await this.prisma.modelVersion.findUnique({
      where: { id: branchId },
    });
    if (!branch || branch.branchType !== BranchType.WHAT_IF) {
      throw new NotFoundException(`What-if branch with ID "${branchId}" not found.`);
    }
    return branch;
  }

  /**
   * Discard (retire) a what-if branch.
   *
   * Sets the branch's state to ROLLED_BACK and removes any capabilities that were
   * created exclusively inside this branch (branchOriginId = branchId).  Their
   * associated CapabilityVersion rows are deleted first (FK constraint) before the
   * Capability rows are removed, freeing the uniqueNames for future use.
   *
   * Capabilities that were only modified or deleted within the branch (but originally
   * exist on MAIN) are left entirely intact.  Their branch CapabilityVersion records
   * remain as an audit trail of what was attempted.
   */
  async discardBranch(branchId: string) {
    const branch = await this.getBranch(branchId);

    if (branch.state === ModelVersionState.ROLLED_BACK) {
      throw new BadRequestException(`Branch "${branchId}" has already been discarded.`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Mark the branch as retired.
      const updatedBranch = await tx.modelVersion.update({
        where: { id: branchId },
        data: { state: ModelVersionState.ROLLED_BACK },
      });

      // Remove branch-local capabilities (branchOriginId = branchId) so their
      // uniqueNames are freed for future use in main or other branches.
      // CapabilityVersion rows must be deleted first due to FK constraints.
      const branchLocalCaps = await tx.capability.findMany({
        where: { branchOriginId: branchId },
        select: { id: true },
      });

      if (branchLocalCaps.length > 0) {
        const branchLocalIds = branchLocalCaps.map((c) => c.id);
        await tx.capabilityVersion.deleteMany({
          where: { capabilityId: { in: branchLocalIds } },
        });
        await tx.capability.deleteMany({
          where: { id: { in: branchLocalIds } },
        });
      }

      return updatedBranch;
    });
  }

  /**
   * Diff a what-if branch against its base version.
   *
   * Delegates entirely to ModelVersionService.computeDiff so the diff logic
   * stays in a single place.  `baseVersionId` is the MAIN DRAFT that was
   * current when this branch was created.
   */
  async diffVsBase(branchId: string) {
    const branch = await this.getBranch(branchId);

    if (!branch.baseVersionId) {
      throw new BadRequestException(
        `Branch "${branchId}" has no base version recorded; cannot compute diff.`,
      );
    }

    return this.modelVersionService.computeDiff(branch.baseVersionId, branchId);
  }

  // ── Capability projection ──────────────────────────────────────────────────

  /**
   * Project the full capability set at the branch state.
   *
   * Algorithm:
   * 1. Reconstruct the capability set at `baseVersionId` using the existing
   *    ModelVersionService snapshot builder (avoids coupling to live Capability
   *    table state which may have advanced since the branch was forked).
   * 2. Apply what-if branch CapabilityVersion entries on top:
   *      - DELETE: exclude from result
   *      - CREATE / UPDATE: use afterSnapshot as field values
   * 3. Capabilities not overridden in the branch are returned from the base
   *    snapshot as-is.
   */
  async listCapabilitiesInBranch(branchId: string) {
    const branch = await this.getBranch(branchId);

    if (!branch.baseVersionId) {
      throw new BadRequestException(
        `Branch "${branchId}" has no base version; cannot project capabilities.`,
      );
    }

    // Step 1: Reconstruct capability state at baseVersionId.
    const baseState = await this.modelVersionService.getCapabilityStateAtVersion(
      branch.baseVersionId,
    );

    // Step 2: Load what-if branch CapabilityVersion entries.
    const branchCvs = await this.prisma.capabilityVersion.findMany({
      where: { modelVersionId: branchId },
      orderBy: { changedAt: 'asc' },
      select: { capabilityId: true, changeType: true, afterSnapshot: true },
    });

    // Latest branch entry per capabilityId.
    const latestBranchEntry = new Map<
      string,
      { changeType: CapabilityVersionChangeType; afterSnapshot: unknown }
    >();
    for (const cv of branchCvs) {
      latestBranchEntry.set(cv.capabilityId, {
        changeType: cv.changeType,
        afterSnapshot: cv.afterSnapshot,
      });
    }

    // Step 3: Build projected list.
    const projected: Record<string, unknown>[] = [];

    // Start from base state.
    for (const [capId, baseSnap] of baseState) {
      if (baseSnap === null) continue; // deleted at base – skip

      const override = latestBranchEntry.get(capId);

      if (!override) {
        projected.push(baseSnap);
        continue;
      }

      if (override.changeType === CapabilityVersionChangeType.DELETE) {
        continue; // deleted within branch
      }

      const snap = override.afterSnapshot as Record<string, unknown> | null;
      if (snap) projected.push(snap);
    }

    // Capabilities created inside the branch (not in baseState) — their CREATE
    // entry carries the full afterSnapshot.
    for (const [capId, entry] of latestBranchEntry) {
      if (baseState.has(capId)) continue; // already handled above

      if (entry.changeType === CapabilityVersionChangeType.CREATE) {
        const snap = entry.afterSnapshot as Record<string, unknown> | null;
        if (snap) projected.push(snap);
      }
    }

    // Sort alphabetically for deterministic ordering.
    projected.sort((a, b) =>
      String(a['uniqueName'] ?? '').localeCompare(String(b['uniqueName'] ?? '')),
    );

    return { items: projected, total: projected.length, branchId };
  }

  /**
   * Project a single capability at the branch state.
   *
   * Resolution order:
   * 1. If the branch has a CapabilityVersion entry for this capability:
   *    - DELETE → 404
   *    - CREATE/UPDATE → use afterSnapshot
   * 2. Otherwise, look up the snapshot from the base version reconstruction.
   * 3. 404 if neither branch nor base has a record for this capability.
   */
  async getCapabilityInBranch(branchId: string, capabilityId: string) {
    const branch = await this.getBranch(branchId);

    // 1. Check branch override.
    const latestCv = await this.prisma.capabilityVersion.findFirst({
      where: { modelVersionId: branchId, capabilityId },
      orderBy: { changedAt: 'desc' },
      select: { changeType: true, afterSnapshot: true },
    });

    if (latestCv) {
      if (latestCv.changeType === CapabilityVersionChangeType.DELETE) {
        throw new NotFoundException(
          `Capability "${capabilityId}" has been deleted within branch "${branchId}".`,
        );
      }
      const snap = latestCv.afterSnapshot as Record<string, unknown> | null;
      if (snap) return snap;
    }

    // 2. Fall back to base version snapshot to avoid leaking live MAIN changes.
    if (branch.baseVersionId) {
      const baseState = await this.modelVersionService.getCapabilityStateAtVersion(
        branch.baseVersionId,
      );
      const baseSnap = baseState.get(capabilityId);
      if (baseSnap !== undefined) {
        if (baseSnap === null) {
          throw new NotFoundException(
            `Capability "${capabilityId}" does not exist at the branch base version.`,
          );
        }
        return baseSnap;
      }
    }

    // 3. Not found in branch or base.
    throw new NotFoundException(`Capability "${capabilityId}" not found.`);
  }

  // ── Branch write guard ─────────────────────────────────────────────────────

  /**
   * Ensure the branch is still active (DRAFT state).  Called by all mutating
   * capability operations to prevent writes to discarded branches.
   */
  private async ensureBranchWritable(branchId: string): Promise<void> {
    const branch = await this.getBranch(branchId);
    if (branch.state !== ModelVersionState.DRAFT) {
      throw new BadRequestException(
        `Branch "${branchId}" is not writable (state: ${branch.state}). Only DRAFT branches accept mutations.`,
      );
    }
  }

  // ── Capability CRUD (branch-scoped) ────────────────────────────────────────

  /**
   * Create a new capability scoped to this what-if branch.
   *
   * A real Capability row is inserted (to satisfy FK constraints on
   * CapabilityVersion.capabilityId) and a CREATE CapabilityVersion entry is
   * recorded against the branch's ModelVersion.  The MAIN DRAFT is not touched.
   */
  async createCapabilityInBranch(
    branchId: string,
    dto: BranchCreateCapabilityDto,
    actorId: string,
  ) {
    await this.ensureBranchWritable(branchId);

    // Guard: uniqueName collision across the shared Capability table.
    const nameConflict = await this.prisma.capability.findUnique({
      where: { uniqueName: dto.uniqueName },
    });
    if (nameConflict) {
      throw new ConflictException(
        `A capability with uniqueName "${dto.uniqueName}" already exists (id: ${nameConflict.id}).`,
      );
    }

    let capabilityId!: string;

    try {
      await this.prisma.$transaction(async (tx) => {
        const capability = await tx.capability.create({
          data: {
            uniqueName: dto.uniqueName,
            aliases: dto.aliases ?? [],
            description: dto.description ?? null,
            domain: dto.domain ?? null,
            type: dto.type ?? 'ABSTRACT',
            parentId: dto.parentId ?? null,
            lifecycleStatus: dto.lifecycleStatus ?? 'DRAFT',
            effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
            effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
            rationale: dto.rationale ?? null,
            sourceReferences: dto.sourceReferences ?? [],
            tags: dto.tags ?? [],
            stewardId: dto.stewardId ?? null,
            stewardDepartment: dto.stewardDepartment ?? null,
            // ── isolation: mark this capability as branch-local so that all
            // main-facing reads (CapabilityService) can filter it out with
            // WHERE branch_origin_id IS NULL.  Never null for branch creates.
            branchOriginId: branchId,
          },
        });
        capabilityId = capability.id;

        const afterSnapshot = capabilityToSnapshot(capability);
        const changedFields = this.capabilityVersionService.computeChangedFields(null, afterSnapshot);

        await tx.capabilityVersion.create({
          data: {
            capabilityId: capability.id,
            modelVersionId: branchId,
            changeType: CapabilityVersionChangeType.CREATE,
            changedFields: changedFields as Prisma.InputJsonValue,
            beforeSnapshot: Prisma.JsonNull,
            afterSnapshot: afterSnapshot as Prisma.InputJsonValue,
            changedBy: actorId,
            previousVersionId: null,
          },
        });
      });
    } catch (error) {
      // Map DB-level uniqueName constraint violations (race window between pre-check
      // and insert) to a controlled 409 rather than a raw 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          `A capability with uniqueName "${dto.uniqueName}" already exists.`,
        );
      }
      throw error;
    }

    return this.getCapabilityInBranch(branchId, capabilityId);
  }

  /**
   * Record an update to a capability within this what-if branch.
   *
   * The Capability table is NOT modified.  A CapabilityVersion (changeType=UPDATE)
   * entry is recorded against the branch, storing the merged afterSnapshot.
   * The prevCv lookup and insert are wrapped in a transaction to avoid
   * history-chain uniqueness races.
   */
  async updateCapabilityInBranch(
    branchId: string,
    capabilityId: string,
    dto: BranchUpdateCapabilityDto,
    actorId: string,
  ) {
    await this.ensureBranchWritable(branchId);

    // Resolve current projected state for this capability in the branch.
    const currentSnapshot = await this.getCapabilityInBranch(branchId, capabilityId);
    const currentRecord = currentSnapshot as Record<string, unknown>;

    // Merge DTO fields onto current state.
    const updatedRecord: Record<string, unknown> = { ...currentRecord };
    const dtoRecord = dto as unknown as Record<string, unknown>;
    for (const key of Object.keys(dtoRecord)) {
      if (dtoRecord[key] !== undefined) {
        updatedRecord[key] = dtoRecord[key];
      }
    }

    const changedFields = this.capabilityVersionService.computeChangedFields(
      currentRecord,
      updatedRecord,
    );

    if (Object.keys(changedFields).length === 0) {
      return currentRecord;
    }

    // Wrap prevCv lookup + insert in a transaction to prevent history-chain races.
    await this.prisma.$transaction(async (tx) => {
      const prevCv = await tx.capabilityVersion.findFirst({
        where: { capabilityId },
        orderBy: { changedAt: 'desc' },
        select: { id: true },
      });

      await tx.capabilityVersion.create({
        data: {
          capabilityId,
          modelVersionId: branchId,
          changeType: CapabilityVersionChangeType.UPDATE,
          changedFields: changedFields as Prisma.InputJsonValue,
          beforeSnapshot: currentRecord as Prisma.InputJsonValue,
          afterSnapshot: updatedRecord as Prisma.InputJsonValue,
          changedBy: actorId,
          previousVersionId: prevCv?.id ?? null,
        },
      });
    });

    return updatedRecord;
  }

  /**
   * Mark a capability as deleted within this what-if branch.
   *
   * Records a DELETE CapabilityVersion entry scoped to the branch.
   * The Capability row is intentionally left in place; the delete is only
   * visible through the branch projection / diff endpoints.
   * The prevCv lookup and insert are wrapped in a transaction to prevent
   * history-chain uniqueness races.
   */
  async deleteCapabilityInBranch(
    branchId: string,
    capabilityId: string,
    actorId: string,
  ): Promise<void> {
    await this.ensureBranchWritable(branchId);

    // Ensure capability exists and hasn't already been deleted in this branch.
    const currentSnapshot = await this.getCapabilityInBranch(branchId, capabilityId);
    const currentRecord = currentSnapshot as Record<string, unknown>;

    const changedFields = this.capabilityVersionService.computeChangedFields(
      currentRecord,
      null,
    );

    await this.prisma.$transaction(async (tx) => {
      const prevCv = await tx.capabilityVersion.findFirst({
        where: { capabilityId },
        orderBy: { changedAt: 'desc' },
        select: { id: true },
      });

      await tx.capabilityVersion.create({
        data: {
          capabilityId,
          modelVersionId: branchId,
          changeType: CapabilityVersionChangeType.DELETE,
          changedFields: changedFields as Prisma.InputJsonValue,
          beforeSnapshot: currentRecord as Prisma.InputJsonValue,
          afterSnapshot: Prisma.JsonNull,
          changedBy: actorId,
          previousVersionId: prevCv?.id ?? null,
        },
      });
    });
  }
}
