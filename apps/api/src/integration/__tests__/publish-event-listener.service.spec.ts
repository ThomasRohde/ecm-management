import { DomainEventBus } from '../../structural-ops/events/capability-domain-events';
import { CAPABILITY_REPARENTED } from '../../structural-ops/events/capability-domain-events';
import { PublishEventListenerService } from '../publish-event-listener.service';
import type { PublishEventService } from '../publish-event.service';

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('PublishEventListenerService', () => {
  function makeService() {
    const eventBus = new DomainEventBus();
    const publishEventService = {
      recordCapabilityEvent: jest.fn().mockResolvedValue(undefined),
      recordModelVersionEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as PublishEventService;

    const listener = new PublishEventListenerService(eventBus, publishEventService);
    listener.onModuleInit();

    return {
      eventBus,
      publishEventService,
    };
  }

  it('records structural capability events from the domain event bus', async () => {
    const { eventBus, publishEventService } = makeService();

    eventBus.emitCapabilityReparented({
      capabilityId: 'cap-1',
      oldParentId: null,
      newParentId: 'parent-2',
      changeRequestId: 'cr-1',
      actorId: 'user-1',
      occurredAt: new Date(),
    });

    await flushAsyncWork();

    expect(publishEventService.recordCapabilityEvent).toHaveBeenCalledWith({
      eventType: CAPABILITY_REPARENTED,
      capabilityId: 'cap-1',
      payloadRef: 'change-request/cr-1',
    });
  });

  it('does not duplicate model version events that are written transactionally', async () => {
    const { eventBus, publishEventService } = makeService();

    eventBus.emitModelVersionPublished({
      modelVersionId: 'release-1',
      versionLabel: 'v1.0',
      actorId: 'user-1',
      newDraftId: 'draft-2',
      occurredAt: new Date(),
    });

    await flushAsyncWork();

    expect(publishEventService.recordModelVersionEvent).not.toHaveBeenCalled();
  });
});
