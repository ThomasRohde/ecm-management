/**
 * CapabilityVersionService
 *
 * Records per-capability change history entries (CapabilityVersion rows) and
 * provides the per-capability history query used by
 * GET /capabilities/:id/history.
 *
 * Design principles:
 * - `recordChange` is always called inside a Prisma transaction so the version
 *   entry is committed atomically with the capability mutation.
 * - `ensureDraftVersionId` bootstraps the initial MAIN DRAFT ModelVersion if
 *   none exists yet (first time a change is recorded in a fresh environment).
 * - History chain linearity: each new entry links back to the most recent
 *   existing CapabilityVersion for that capability via `previousVersionId`.
 */

import { Injectable } from '@nestjs/common';
import {
  BranchType,
  CapabilityVersionChangeType,
  ModelVersionState,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The subset of the Prisma client shared between PrismaService and TransactionClient. */
type TxClient = Prisma.TransactionClient;

export interface RecordChangeParams {
  capabilityId: string;
  changeType: CapabilityVersionChangeType;
  /** Full capability snapshot before the change (null for CREATE). */
  beforeSnapshot: Record<string, unknown> | null;
  /** Full capability snapshot after the change (null for DELETE). */
  afterSnapshot: Record<string, unknown> | null;
  changedBy: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CapabilityVersionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a capability change in the current MAIN DRAFT ModelVersion.
   * If no DRAFT exists, one is created automatically.
   *
   * Must be called inside a Prisma transaction for atomicity.
   */
  async recordChange(tx: TxClient, params: RecordChangeParams): Promise<void> {
    const modelVersionId = await this.ensureDraftVersionId(tx, params.changedBy);
    const changedFields = this.computeChangedFields(params.beforeSnapshot, params.afterSnapshot);

    // Link to the most recent CapabilityVersion for this capability (history chain).
    const previousVersion = await tx.capabilityVersion.findFirst({
      where: { capabilityId: params.capabilityId },
      orderBy: { changedAt: 'desc' },
      select: { id: true },
    });

    await tx.capabilityVersion.create({
      data: {
        capabilityId: params.capabilityId,
        modelVersionId,
        changeType: params.changeType,
        changedFields: changedFields as Prisma.InputJsonValue,
        beforeSnapshot:
          params.beforeSnapshot !== null
            ? (params.beforeSnapshot as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        afterSnapshot:
          params.afterSnapshot !== null
            ? (params.afterSnapshot as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        changedBy: params.changedBy,
        previousVersionId: previousVersion?.id ?? null,
      },
    });
  }

  /**
   * Get paginated change history for a single capability.
   * Most recent entries first.
   */
  async getHistory(
    capabilityId: string,
    options?: { page?: number; limit?: number },
  ) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 25));

    const [items, total] = await Promise.all([
      this.prisma.capabilityVersion.findMany({
        where: { capabilityId },
        orderBy: { changedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          modelVersion: {
            select: {
              id: true,
              versionLabel: true,
              state: true,
              publishedAt: true,
            },
          },
        },
      }),
      this.prisma.capabilityVersion.count({ where: { capabilityId } }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      capabilityId,
    };
  }

  /**
   * Ensure a MAIN DRAFT ModelVersion exists, creating one if needed.
   * Returns the draft's ID.  Safe to call multiple times; idempotent.
   */
  async ensureDraftVersionId(tx: TxClient, createdBy: string): Promise<string> {
    const existing = await tx.modelVersion.findFirst({
      where: { state: ModelVersionState.DRAFT, branchType: BranchType.MAIN },
      select: { id: true },
    });

    if (existing) return existing.id;

    const created = await tx.modelVersion.create({
      data: {
        versionLabel: `draft-${Date.now()}`,
        state: ModelVersionState.DRAFT,
        branchType: BranchType.MAIN,
        createdBy,
      },
      select: { id: true },
    });

    return created.id;
  }

  /**
   * Record a capability change without requiring a pre-existing transaction.
   * Opens its own Prisma interactive transaction.
   *
   * Use this from CapabilityService.create/update where the caller doesn't
   * already hold a transaction client.  Structural-ops should still use
   * `recordChange` since they manage their own transaction.
   */
  async recordChangeDirect(params: RecordChangeParams): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.recordChange(tx, params);
    });
  }

  /**
   * Compute a field-level delta between two snapshots.
   *
   * - CREATE (before=null): returns all `after` fields with before=null
   * - DELETE (after=null):  returns all `before` fields with after=null
   * - UPDATE: returns only fields whose values differ
   */
  computeChangedFields(
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Record<string, { before: unknown; after: unknown }> {
    if (!before && !after) return {};

    if (!before) {
      // CREATE
      return Object.fromEntries(
        Object.entries(after!).map(([k, v]) => [k, { before: null, after: v }]),
      );
    }

    if (!after) {
      // DELETE
      return Object.fromEntries(
        Object.entries(before).map(([k, v]) => [k, { before: v, after: null }]),
      );
    }

    // UPDATE: only emit fields that actually changed
    const result: Record<string, { before: unknown; after: unknown }> = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        result[key] = { before: before[key], after: after[key] };
      }
    }

    return result;
  }
}
