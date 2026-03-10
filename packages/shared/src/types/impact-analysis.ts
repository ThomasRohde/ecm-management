// ─── Impact Analysis shared types ─────────────────────────────────────────────
//
// These types model the result of impact analysis for a set of capability IDs.
// They are shared between the API and the web frontend so both sides use the
// same contract without duplication.

/**
 * Severity of the impact, computed by the backend based on operation type
 * and the number/state of affected mappings.
 *
 * NOTE: The API defines an equivalent enum in impact-analysis.service.ts.
 * Keep both in sync.
 */
export enum ImpactSeverity {
  /** No active mappings on the affected capabilities. */
  LOW = 'LOW',
  /** Active mappings exist but the operation is non-destructive. */
  MEDIUM = 'MEDIUM',
  /** Active mappings exist AND the operation is RETIRE or MERGE. */
  HIGH = 'HIGH',
}

/**
 * Minimal mapping shape returned in impact analysis results.
 * Uses string for state to stay compatible across the API/web boundary
 * (the API uses Prisma MappingState, the web uses @ecm/shared MappingState).
 */
export interface ImpactedMapping {
  id: string;
  mappingType: string;
  systemId: string;
  capabilityId: string;
  state: string;
  attributes: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A downstream system that is affected by the operation, represented by its
 * systemId (free-form string on the Mapping record) and the list of mapping
 * IDs through which it is connected to the affected capabilities.
 */
export interface ImpactedSystem {
  systemId: string;
  mappingIds: string[];
  activeMappingCount: number;
}

/**
 * The computed summary counts included in an ImpactAnalysisResult.
 */
export interface ImpactSummaryData {
  totalMappings: number;
  activeMappings: number;
  inactiveMappings: number;
  pendingMappings: number;
  affectedSystemCount: number;
  severity: ImpactSeverity;
}

/**
 * Full result returned by the impact analysis endpoints.
 */
export interface ImpactAnalysisResult {
  capabilityIds: string[];
  /** All mappings (of any state) linked to the affected capabilities. */
  impactedMappings: ImpactedMapping[];
  /** Systems that have at least one mapping to the affected capabilities. */
  impactedSystems: ImpactedSystem[];
  summary: ImpactSummaryData;
}

/**
 * Input for the standalone POST /impact-analysis endpoint.
 */
export interface ImpactAnalysisInput {
  capabilityIds: string[];
  /** Operation type used to determine severity. Optional – defaults to MEDIUM severity computation. */
  operationType?: string;
}
