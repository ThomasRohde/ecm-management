import {
  DeliveryStatus,
  HealthStatus,
  type DownstreamConsumer,
  type PublishEvent,
} from '@prisma/client';
import type { DownstreamConsumerService } from '../downstream-consumer.service';
import {
  DownstreamConsumerPublishEventDeliveryClient,
} from '../publish-event-delivery.client';
import { TransformationProfileService } from '../transformation-profile.service';

function createConsumer(overrides: Partial<DownstreamConsumer> = {}): DownstreamConsumer {
  return {
    id: 'consumer-1',
    name: 'ServiceNow',
    contractType: 'REST_API',
    syncMode: 'REALTIME',
    transformationProfile: 'published-model-v1',
    healthStatus: HealthStatus.HEALTHY,
    createdAt: new Date('2026-03-10T08:00:00.000Z'),
    updatedAt: new Date('2026-03-10T09:00:00.000Z'),
    ...overrides,
  };
}

function createPublishEvent(overrides: Partial<PublishEvent> = {}): PublishEvent {
  return {
    id: 'event-1',
    eventType: 'model-version.published',
    modelVersionId: 'version-1',
    entityId: 'version-1',
    payloadRef: 'model-version/version-1',
    publishedAt: new Date('2026-03-10T10:00:00.000Z'),
    deliveryStatus: DeliveryStatus.PENDING,
    attemptCount: 0,
    maxAttempts: 5,
    lastAttemptAt: null,
    nextAttemptAt: new Date('2026-03-10T10:00:00.000Z'),
    deliveredAt: null,
    lastError: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    ...overrides,
  };
}

describe('DownstreamConsumerPublishEventDeliveryClient', () => {
  function makeClient(consumers: DownstreamConsumer[]) {
    const downstreamConsumerService = {
      listRegisteredConsumers: jest.fn().mockResolvedValue(consumers),
      recordDeliveryAttempt: jest.fn().mockResolvedValue(undefined),
    } as unknown as DownstreamConsumerService;

    return {
      downstreamConsumerService,
      client: new DownstreamConsumerPublishEventDeliveryClient(
        downstreamConsumerService,
        new TransformationProfileService(),
      ),
    };
  }

  it('returns immediately when no downstream consumers are registered', async () => {
    const { client, downstreamConsumerService } = makeClient([]);

    await expect(client.deliver(createPublishEvent())).resolves.toBeUndefined();
    expect(downstreamConsumerService.recordDeliveryAttempt).not.toHaveBeenCalled();
  });

  it('records delivered attempts for healthy downstream consumers', async () => {
    const healthyConsumer = createConsumer();
    const { client, downstreamConsumerService } = makeClient([healthyConsumer]);

    await expect(client.deliver(createPublishEvent())).resolves.toBeUndefined();

    expect(downstreamConsumerService.recordDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        consumer: healthyConsumer,
        deliveryStatus: DeliveryStatus.DELIVERED,
        transformationProfile: 'published-model-v1',
        evidence: expect.objectContaining({
          payloadSchema: 'published-model.v1',
          contractType: 'REST_API',
          syncMode: 'REALTIME',
        }),
      }),
    );
  });

  it('records failures and throws when an unhealthy consumer blocks delivery', async () => {
    const unhealthyConsumer = createConsumer({
      id: 'consumer-2',
      name: 'Analytics Lake',
      contractType: 'BATCH_EXPORT',
      syncMode: 'BATCH_DAILY',
      transformationProfile: 'release-summary-v1',
      healthStatus: HealthStatus.UNHEALTHY,
    });
    const { client, downstreamConsumerService } = makeClient([unhealthyConsumer]);

    await expect(client.deliver(createPublishEvent())).rejects.toThrow(
      /analytics lake/i,
    );

    expect(downstreamConsumerService.recordDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        consumer: unhealthyConsumer,
        deliveryStatus: DeliveryStatus.FAILED,
        transformationProfile: 'release-summary-v1',
        message: 'Consumer "Analytics Lake" is marked UNHEALTHY and is blocking delivery.',
      }),
    );
  });

  it('records failures when transformation profile resolution fails', async () => {
    const invalidProfileConsumer = createConsumer({
      id: 'consumer-3',
      name: 'Risk Controls',
      transformationProfile: 'unknown-profile',
    });
    const { client, downstreamConsumerService } = makeClient([invalidProfileConsumer]);

    await expect(client.deliver(createPublishEvent())).rejects.toThrow(/failed to deliver/i);

    expect(downstreamConsumerService.recordDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        consumer: invalidProfileConsumer,
        deliveryStatus: DeliveryStatus.FAILED,
        transformationProfile: 'unknown-profile',
      }),
    );
  });
});
