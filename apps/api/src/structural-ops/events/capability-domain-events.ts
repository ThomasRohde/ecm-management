/**
 * Domain event types and in-process event bus for structural capability operations.
 *
 * Design principles:
 * - Events are emitted AFTER the database transaction commits (never inside a
 *   transaction) so consumers never see phantom events for rolled-back changes.
 * - No external integrations are introduced here.  The bus is an in-process
 *   Node.js EventEmitter.  Phase 8 will add the outbox → pub/sub pipeline that
 *   fans these events out to downstream consumers.
 * - Event payloads are plain objects (value objects) with enough context for
 *   subscribers to act without a second round-trip to the database.
 */

import { EventEmitter } from 'node:events';
import { Injectable } from '@nestjs/common';

// ─── Event name constants ────────────────────────────────────────────────────

export const CAPABILITY_REPARENTED = 'capability.reparented';
export const CAPABILITY_PROMOTED = 'capability.promoted';
export const CAPABILITY_DEMOTED = 'capability.demoted';
export const CAPABILITY_MERGED = 'capability.merged';
export const CAPABILITY_RETIRED = 'capability.retired';
export const CAPABILITY_DELETED = 'capability.deleted';
export const MODEL_VERSION_PUBLISHED = 'model-version.published';
export const MODEL_VERSION_ROLLED_BACK = 'model-version.rolled-back';

// ─── Event payload interfaces ────────────────────────────────────────────────

export interface CapabilityReparentedPayload {
  capabilityId: string;
  oldParentId: string | null;
  newParentId: string | null;
  changeRequestId: string;
  actorId: string;
  occurredAt: Date;
}

export interface CapabilityPromotedPayload {
  capabilityId: string;
  changeRequestId: string;
  actorId: string;
  occurredAt: Date;
}

export interface CapabilityDemotedPayload {
  capabilityId: string;
  changeRequestId: string;
  actorId: string;
  occurredAt: Date;
}

export interface CapabilityMergedPayload {
  survivorCapabilityId: string;
  retiredSourceIds: string[];
  transferredChildCount: number;
  transferredMappingCount: number;
  changeRequestId: string;
  actorId: string;
  occurredAt: Date;
}

export interface CapabilityRetiredPayload {
  retiredCapabilityIds: string[];
  flaggedMappingIds: string[];
  effectiveTo: Date;
  changeRequestId: string;
  actorId: string;
  occurredAt: Date;
}

export interface CapabilityDeletedPayload {
  capabilityId: string;
  changeRequestId: string;
  actorId: string;
  occurredAt: Date;
}

export interface ModelVersionPublishedPayload {
  modelVersionId: string;
  versionLabel: string;
  actorId: string;
  newDraftId: string;
  occurredAt: Date;
}

export interface ModelVersionRolledBackPayload {
  modelVersionId: string;
  rollbackOfVersionId: string;
  actorId: string;
  occurredAt: Date;
}

// ─── Union for metadata serialisation ────────────────────────────────────────

export type CapabilityDomainEventPayload =
  | CapabilityReparentedPayload
  | CapabilityPromotedPayload
  | CapabilityDemotedPayload
  | CapabilityMergedPayload
  | CapabilityRetiredPayload
  | CapabilityDeletedPayload
  | ModelVersionPublishedPayload
  | ModelVersionRolledBackPayload;

// ─── Domain event bus ────────────────────────────────────────────────────────

/**
 * In-process domain event bus.
 *
 * Singleton per NestJS application instance (module scope = default).
 * Listeners registered via `.on(CAPABILITY_REPARENTED, handler)` will receive
 * the typed payload directly.
 *
 * Example subscriber (to be wired up in Phase 8):
 *   eventBus.on(CAPABILITY_RETIRED, (p: CapabilityRetiredPayload) => {
 *     publishEventService.record(p);
 *   });
 */
@Injectable()
export class DomainEventBus extends EventEmitter {
  emitCapabilityReparented(payload: CapabilityReparentedPayload): void {
    this.emit(CAPABILITY_REPARENTED, payload);
  }

  emitCapabilityPromoted(payload: CapabilityPromotedPayload): void {
    this.emit(CAPABILITY_PROMOTED, payload);
  }

  emitCapabilityDemoted(payload: CapabilityDemotedPayload): void {
    this.emit(CAPABILITY_DEMOTED, payload);
  }

  emitCapabilityMerged(payload: CapabilityMergedPayload): void {
    this.emit(CAPABILITY_MERGED, payload);
  }

  emitCapabilityRetired(payload: CapabilityRetiredPayload): void {
    this.emit(CAPABILITY_RETIRED, payload);
  }

  emitCapabilityDeleted(payload: CapabilityDeletedPayload): void {
    this.emit(CAPABILITY_DELETED, payload);
  }

  emitModelVersionPublished(payload: ModelVersionPublishedPayload): void {
    this.emit(MODEL_VERSION_PUBLISHED, payload);
  }

  emitModelVersionRolledBack(payload: ModelVersionRolledBackPayload): void {
    this.emit(MODEL_VERSION_ROLLED_BACK, payload);
  }
}
