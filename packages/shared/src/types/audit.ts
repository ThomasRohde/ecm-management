/**
 * Phase 9B – Generic Audit Trail shared contracts.
 *
 * These types mirror the Prisma `AuditEntry` model and its enums.
 * The generic audit trail supplements (but does not replace) the
 * existing `ChangeRequestAuditEntry` – which remains change-request-scoped.
 */

/** Discriminator for the entity being audited. Mirrors Prisma AuditEntityType. */
export enum AuditEntityType {
  CAPABILITY = 'CAPABILITY',
  CHANGE_REQUEST = 'CHANGE_REQUEST',
  MODEL_VERSION = 'MODEL_VERSION',
  MAPPING = 'MAPPING',
  DOWNSTREAM_CONSUMER = 'DOWNSTREAM_CONSUMER',
  USER = 'USER',
  AUTH_EVENT = 'AUTH_EVENT',
}

/** Verb describing what happened. Mirrors Prisma AuditAction. */
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  PUBLISH = 'PUBLISH',
  ROLLBACK = 'ROLLBACK',
  SUBMIT = 'SUBMIT',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  CANCEL = 'CANCEL',
  LOCK = 'LOCK',
  UNLOCK = 'UNLOCK',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',
}

/** Immutable audit record – no `updatedAt`, rows are never mutated after insert. */
export interface AuditEntry {
  id: string;
  entityType: AuditEntityType;
  /** UUID of the affected record – intentionally a plain string (no FK). */
  entityId: string;
  action: AuditAction;
  /** User.id, service-account name, or the literal string "system". */
  actorId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  timestamp: string;
}

// ─── Query / response shapes ─────────────────────────────────────────────────

export interface AuditEntryListResponse {
  items: AuditEntry[];
  total: number;
}

export interface QueryAuditEntriesInput {
  entityType?: AuditEntityType;
  entityId?: string;
  actorId?: string;
  action?: AuditAction;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}
