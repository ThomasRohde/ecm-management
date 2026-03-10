export enum ChangeRequestStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum ApprovalDecisionOutcome {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum ChangeRequestType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  REPARENT = 'REPARENT',
  PROMOTE = 'PROMOTE',
  DEMOTE = 'DEMOTE',
  MERGE = 'MERGE',
  RETIRE = 'RETIRE',
}

export interface ChangeRequest {
  id: string;
  type: ChangeRequestType;
  status: ChangeRequestStatus;
  requestedBy: string;
  rationale: string | null;
  affectedCapabilityIds: string[];
  operationPayload: Record<string, unknown> | null;
  impactSummary: string | null;
  downstreamPlan: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalDecision {
  id: string;
  changeRequestId: string;
  approverRole: string;
  approverId: string;
  decision: ApprovalDecisionOutcome;
  comment: string | null;
  decidedAt: string;
}

export interface ChangeRequestAuditEntry {
  id: string;
  changeRequestId: string;
  actorId: string;
  eventType: string;
  fromStatus: ChangeRequestStatus | null;
  toStatus: ChangeRequestStatus | null;
  comment: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CapabilityLock {
  id: string;
  capabilityId: string;
  changeRequestId: string;
  lockedAt: string;
  lockedBy: string;
}

// ─── DTO shapes used by API endpoints ───────────────────────────────────────

export interface CreateChangeRequestInput {
  type: ChangeRequestType;
  rationale: string;
  affectedCapabilityIds: string[];
  operationPayload?: Record<string, unknown>;
  impactSummary?: string;
  downstreamPlan?: string;
}

export interface ChangeRequestListResponse {
  items: ChangeRequest[];
  total: number;
}
