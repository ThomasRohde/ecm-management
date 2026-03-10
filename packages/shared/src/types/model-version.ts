// ─── Enums (must mirror Prisma schema) ─────────────────────────────────────

export enum BranchType {
  MAIN = 'MAIN',
  WHAT_IF = 'WHAT_IF',
}

export enum ModelVersionStateEnum {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ROLLED_BACK = 'ROLLED_BACK',
}

export enum CapabilityVersionChangeType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  RENAME = 'RENAME',
  REPARENT = 'REPARENT',
  PROMOTE = 'PROMOTE',
  DEMOTE = 'DEMOTE',
  MERGE = 'MERGE',
  RETIRE = 'RETIRE',
  DELETE = 'DELETE',
}

// ─── ModelVersion ────────────────────────────────────────────────────────────

export interface ModelVersion {
  id: string;
  versionLabel: string;
  state: ModelVersionStateEnum;
  /** UUID of the version this was branched/derived from (lineage). */
  baseVersionId: string | null;
  branchType: BranchType;
  /** Human-readable branch identifier for WHAT_IF branches; null on MAIN. */
  branchName: string | null;
  /** Optional label or release description for snapshot versions. */
  description: string | null;
  /** Rationale captured at publish or rollback time. */
  notes: string | null;
  createdBy: string;
  approvedBy: string | null;
  publishedAt: string | null;
  /** UUID of the version this rollback was created from (if applicable). */
  rollbackOfVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── CapabilityVersion ───────────────────────────────────────────────────────

export interface CapabilityVersion {
  id: string;
  capabilityId: string;
  modelVersionId: string;
  changeType: CapabilityVersionChangeType;
  /**
   * Field-level delta stored as `{ before: Record<string,unknown>, after: Record<string,unknown> }`.
   * Keys are the changed field names; values are the old (before) and new (after) values.
   */
  changedFields: Record<string, unknown>;
  /** Full capability record snapshot immediately *before* this change (null for CREATE). */
  beforeSnapshot: Record<string, unknown> | null;
  /** Full capability record snapshot immediately *after* this change (null for DELETE). */
  afterSnapshot: Record<string, unknown> | null;
  changedBy: string;
  changedAt: string;
  /** UUID of the immediately preceding CapabilityVersion entry for this capability (history chain). */
  previousVersionId: string | null;
}

// ─── Input / DTO shapes ──────────────────────────────────────────────────────

export interface CreateModelVersionInput {
  versionLabel: string;
  branchType?: BranchType;
  branchName?: string;
  description?: string;
  baseVersionId?: string;
  createdBy: string;
}

export interface PublishModelVersionInput {
  approvedBy: string;
  notes?: string;
}

export interface RollbackModelVersionInput {
  rollbackOfVersionId: string;
  createdBy: string;
  notes?: string;
}

export interface ModelVersionListResponse {
  items: ModelVersion[];
  total: number;
}

export interface CapabilityVersionListResponse {
  items: CapabilityVersion[];
  total: number;
  capabilityId: string;
}

