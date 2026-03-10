import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CAPABILITY_DELETED,
  CAPABILITY_DEMOTED,
  CAPABILITY_MERGED,
  CAPABILITY_PROMOTED,
  CAPABILITY_REPARENTED,
  CAPABILITY_RETIRED,
  DomainEventBus,
  type CapabilityDeletedPayload,
  type CapabilityDemotedPayload,
  type CapabilityMergedPayload,
  type CapabilityPromotedPayload,
  type CapabilityReparentedPayload,
  type CapabilityRetiredPayload,
} from '../structural-ops/events/capability-domain-events';
import { PublishEventService } from './publish-event.service';

@Injectable()
export class PublishEventListenerService implements OnModuleInit {
  private readonly logger = new Logger(PublishEventListenerService.name);

  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly publishEventService: PublishEventService,
  ) {}

  onModuleInit(): void {
    this.registerListeners();
  }

  private registerListeners(): void {
    this.eventBus.on(CAPABILITY_REPARENTED, (payload: CapabilityReparentedPayload) => {
      void this.safeRecord(
        () =>
          this.publishEventService.recordCapabilityEvent({
            eventType: CAPABILITY_REPARENTED,
            capabilityId: payload.capabilityId,
            payloadRef: `change-request/${payload.changeRequestId}`,
          }),
        `${CAPABILITY_REPARENTED}:${payload.capabilityId}`,
      );
    });

    this.eventBus.on(CAPABILITY_PROMOTED, (payload: CapabilityPromotedPayload) => {
      void this.safeRecord(
        () =>
          this.publishEventService.recordCapabilityEvent({
            eventType: CAPABILITY_PROMOTED,
            capabilityId: payload.capabilityId,
            payloadRef: `change-request/${payload.changeRequestId}`,
          }),
        `${CAPABILITY_PROMOTED}:${payload.capabilityId}`,
      );
    });

    this.eventBus.on(CAPABILITY_DEMOTED, (payload: CapabilityDemotedPayload) => {
      void this.safeRecord(
        () =>
          this.publishEventService.recordCapabilityEvent({
            eventType: CAPABILITY_DEMOTED,
            capabilityId: payload.capabilityId,
            payloadRef: `change-request/${payload.changeRequestId}`,
          }),
        `${CAPABILITY_DEMOTED}:${payload.capabilityId}`,
      );
    });

    this.eventBus.on(CAPABILITY_MERGED, (payload: CapabilityMergedPayload) => {
      void this.safeRecord(
        () =>
          this.publishEventService.recordCapabilityEvent({
            eventType: CAPABILITY_MERGED,
            capabilityId: payload.survivorCapabilityId,
            payloadRef: `change-request/${payload.changeRequestId}`,
          }),
        `${CAPABILITY_MERGED}:${payload.survivorCapabilityId}`,
      );
    });

    this.eventBus.on(CAPABILITY_RETIRED, (payload: CapabilityRetiredPayload) => {
      for (const capabilityId of payload.retiredCapabilityIds) {
        void this.safeRecord(
          () =>
            this.publishEventService.recordCapabilityEvent({
              eventType: CAPABILITY_RETIRED,
              capabilityId,
              payloadRef: `change-request/${payload.changeRequestId}`,
            }),
          `${CAPABILITY_RETIRED}:${capabilityId}`,
        );
      }
    });

    this.eventBus.on(CAPABILITY_DELETED, (payload: CapabilityDeletedPayload) => {
      void this.safeRecord(
        () =>
          this.publishEventService.recordCapabilityEvent({
            eventType: CAPABILITY_DELETED,
            capabilityId: payload.capabilityId,
            payloadRef: `change-request/${payload.changeRequestId}`,
          }),
        `${CAPABILITY_DELETED}:${payload.capabilityId}`,
      );
    });

  }

  private async safeRecord(work: () => Promise<unknown>, context: string): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error(`Failed to record publish event for ${context}: ${String(error)}`);
    }
  }
}
