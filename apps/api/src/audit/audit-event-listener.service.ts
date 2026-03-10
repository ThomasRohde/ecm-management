/**
 * AuditEventListenerService
 *
 * Subscribes to the in-process DomainEventBus and writes a generic AuditEntry
 * for every structural capability domain event.
 *
 * Design:
 * - Listeners are registered in onModuleInit (after DI is wired).
 * - Audit writes are fire-and-forget (`void`) so a slow DB write never blocks
 *   the event emitter path.
 * - A separate AuditEntry is created per retired/affected capability ID so
 *   per-entity queries are cheap.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AuditAction, AuditEntityType } from '@prisma/client';
import {
  DomainEventBus,
  CAPABILITY_REPARENTED,
  CAPABILITY_PROMOTED,
  CAPABILITY_DEMOTED,
  CAPABILITY_MERGED,
  CAPABILITY_RETIRED,
  CAPABILITY_DELETED,
} from '../structural-ops/events/capability-domain-events';
import type {
  CapabilityReparentedPayload,
  CapabilityPromotedPayload,
  CapabilityDemotedPayload,
  CapabilityMergedPayload,
  CapabilityRetiredPayload,
  CapabilityDeletedPayload,
} from '../structural-ops/events/capability-domain-events';
import { AuditService } from './audit.service';

@Injectable()
export class AuditEventListenerService implements OnModuleInit {
  private readonly logger = new Logger(AuditEventListenerService.name);

  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit(): void {
    this.registerListeners();
  }

  private registerListeners(): void {
    this.eventBus.on(CAPABILITY_REPARENTED, (p: CapabilityReparentedPayload) => {
      void this.safeRecord({
        entityType: AuditEntityType.CAPABILITY,
        entityId: p.capabilityId,
        action: AuditAction.UPDATE,
        actorId: p.actorId,
        metadata: {
          event: CAPABILITY_REPARENTED,
          oldParentId: p.oldParentId,
          newParentId: p.newParentId,
          changeRequestId: p.changeRequestId,
        },
      });
    });

    this.eventBus.on(CAPABILITY_PROMOTED, (p: CapabilityPromotedPayload) => {
      void this.safeRecord({
        entityType: AuditEntityType.CAPABILITY,
        entityId: p.capabilityId,
        action: AuditAction.UPDATE,
        actorId: p.actorId,
        metadata: {
          event: CAPABILITY_PROMOTED,
          changeRequestId: p.changeRequestId,
        },
      });
    });

    this.eventBus.on(CAPABILITY_DEMOTED, (p: CapabilityDemotedPayload) => {
      void this.safeRecord({
        entityType: AuditEntityType.CAPABILITY,
        entityId: p.capabilityId,
        action: AuditAction.UPDATE,
        actorId: p.actorId,
        metadata: {
          event: CAPABILITY_DEMOTED,
          changeRequestId: p.changeRequestId,
        },
      });
    });

    this.eventBus.on(CAPABILITY_MERGED, (p: CapabilityMergedPayload) => {
      void this.safeRecord({
        entityType: AuditEntityType.CAPABILITY,
        entityId: p.survivorCapabilityId,
        action: AuditAction.UPDATE,
        actorId: p.actorId,
        metadata: {
          event: CAPABILITY_MERGED,
          retiredSourceIds: p.retiredSourceIds,
          transferredChildCount: p.transferredChildCount,
          transferredMappingCount: p.transferredMappingCount,
          changeRequestId: p.changeRequestId,
        },
      });
    });

    this.eventBus.on(CAPABILITY_RETIRED, (p: CapabilityRetiredPayload) => {
      // One AuditEntry per retired capability so per-entity queries stay cheap.
      for (const capabilityId of p.retiredCapabilityIds) {
        void this.safeRecord({
          entityType: AuditEntityType.CAPABILITY,
          entityId: capabilityId,
          action: AuditAction.UPDATE,
          actorId: p.actorId,
          metadata: {
            event: CAPABILITY_RETIRED,
            flaggedMappingIds: p.flaggedMappingIds,
            changeRequestId: p.changeRequestId,
          },
        });
      }
    });

    this.eventBus.on(CAPABILITY_DELETED, (p: CapabilityDeletedPayload) => {
      void this.safeRecord({
        entityType: AuditEntityType.CAPABILITY,
        entityId: p.capabilityId,
        action: AuditAction.DELETE,
        actorId: p.actorId,
        metadata: {
          event: CAPABILITY_DELETED,
          changeRequestId: p.changeRequestId,
        },
      });
    });
  }

  private async safeRecord(
    params: Parameters<AuditService['record']>[0],
  ): Promise<void> {
    try {
      await this.auditService.record(params);
    } catch (err) {
      // Audit failures must never crash the application – log and continue.
      this.logger.error(
        `Failed to record audit entry for ${params.entityType}/${params.entityId}: ${String(err)}`,
      );
    }
  }
}
