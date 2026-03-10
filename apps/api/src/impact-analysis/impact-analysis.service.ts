import { Injectable } from '@nestjs/common';
import { ChangeRequestType, MappingState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// ─── Local severity enum ──────────────────────────────────────────────────────
// NOTE: The @ecm/shared package re-exports an equivalent ImpactSeverity for the
// web frontend.  Keep both in sync when changing values.

export enum ImpactSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ImpactedSystem {
  systemId: string;
  mappingIds: string[];
  activeMappingCount: number;
}

export interface ImpactSummaryData {
  totalMappings: number;
  activeMappings: number;
  inactiveMappings: number;
  pendingMappings: number;
  affectedSystemCount: number;
  severity: ImpactSeverity;
}

export interface ImpactAnalysisResult {
  capabilityIds: string[];
  impactedMappings: {
    id: string;
    mappingType: string;
    systemId: string;
    capabilityId: string;
    state: string;
    attributes: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
  }[];
  impactedSystems: ImpactedSystem[];
  summary: ImpactSummaryData;
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

/**
 * Operation types that, when combined with active mappings, warrant HIGH
 * severity: the capability is being permanently retired or absorbed, so every
 * downstream system that still depends on it is directly disrupted.
 */
const HIGH_SEVERITY_TYPES = new Set<ChangeRequestType>([
  ChangeRequestType.RETIRE,
  ChangeRequestType.MERGE,
]);

/**
 * Compute the impact severity for an operation given the number of active
 * mappings it touches.
 *
 * - HIGH   → destructive op type (RETIRE/MERGE) with at least one active mapping
 * - MEDIUM → either:
 *              a) active mappings exist on a non-destructive op
 *              b) no active mappings but inactive/pending mappings still exist
 *                 (surfacing these to approvers even though they won't block)
 * - LOW    → no mappings at all on the affected capabilities
 */
export function computeSeverity(
  activeMappings: number,
  totalMappings: number,
  operationType?: ChangeRequestType,
): ImpactSeverity {
  if (activeMappings > 0 && operationType && HIGH_SEVERITY_TYPES.has(operationType)) {
    return ImpactSeverity.HIGH;
  }
  if (activeMappings > 0) {
    return ImpactSeverity.MEDIUM;
  }
  if (totalMappings > 0) {
    // Has mappings but none active — still worth flagging
    return ImpactSeverity.MEDIUM;
  }
  return ImpactSeverity.LOW;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ImpactAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute the impact of a structural or data operation on the given set of
   * capability IDs.
   *
   * Returns every mapping (all states) that is linked to the affected
   * capabilities, a per-system breakdown, and an aggregated summary with
   * severity.
   *
   * This method is read-only (no mutations) and is safe to call at any point
   * in the change-request lifecycle, including before the request is submitted.
   */
  async analyse(
    capabilityIds: string[],
    operationType?: ChangeRequestType,
  ): Promise<ImpactAnalysisResult> {
    if (capabilityIds.length === 0) {
      return this.emptyResult(capabilityIds);
    }

    const mappingRows = await this.prisma.mapping.findMany({
      where: { capabilityId: { in: capabilityIds } },
      include: { capability: true },
      orderBy: { createdAt: 'desc' },
    });

    // ── Per-system grouping ──────────────────────────────────────────────────
    const systemMap = new Map<string, { mappingIds: string[]; activeCount: number }>();
    for (const m of mappingRows) {
      const entry = systemMap.get(m.systemId) ?? { mappingIds: [], activeCount: 0 };
      entry.mappingIds.push(m.id);
      if (m.state === MappingState.ACTIVE) {
        entry.activeCount += 1;
      }
      systemMap.set(m.systemId, entry);
    }

    const impactedSystems: ImpactedSystem[] = [...systemMap.entries()].map(
      ([systemId, { mappingIds, activeCount }]) => ({
        systemId,
        mappingIds,
        activeMappingCount: activeCount,
      }),
    );

    // ── Counts ───────────────────────────────────────────────────────────────
    const activeMappings = mappingRows.filter((m) => m.state === MappingState.ACTIVE).length;
    const inactiveMappings = mappingRows.filter((m) => m.state === MappingState.INACTIVE).length;
    const pendingMappings = mappingRows.filter((m) => m.state === MappingState.PENDING).length;

    const summary: ImpactSummaryData = {
      totalMappings: mappingRows.length,
      activeMappings,
      inactiveMappings,
      pendingMappings,
      affectedSystemCount: impactedSystems.length,
      severity: computeSeverity(activeMappings, mappingRows.length, operationType),
    };

    // ── Shape mappings to shared Mapping interface ───────────────────────────
    const impactedMappings = mappingRows.map((m) => ({
      id: m.id,
      mappingType: m.mappingType,
      systemId: m.systemId,
      capabilityId: m.capabilityId,
      state: m.state as string,
      attributes: m.attributes as Record<string, unknown> | null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));

    return {
      capabilityIds,
      impactedMappings,
      impactedSystems,
      summary,
    };
  }

  /**
   * Convenience: analyse the impact for a change request by its stored
   * affectedCapabilityIds and type.  Fetches the CR data, delegates to
   * `analyse()`.  Callers that already have the CR data should call
   * `analyse()` directly.
   */
  async analyseForChangeRequest(changeRequestId: string): Promise<ImpactAnalysisResult> {
    const cr = await this.prisma.changeRequest.findUnique({
      where: { id: changeRequestId },
      select: { affectedCapabilityIds: true, type: true },
    });

    if (!cr) {
      // Let the caller surface the 404 via ChangeRequestNotFoundException if needed.
      // Here we return an empty result with the unknown id so the response is
      // well-formed rather than throwing from a "read" path.
      return this.emptyResult([changeRequestId]);
    }

    return this.analyse(
      cr.affectedCapabilityIds,
      cr.type as ChangeRequestType,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private emptyResult(capabilityIds: string[]): ImpactAnalysisResult {
    return {
      capabilityIds,
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
  }
}
