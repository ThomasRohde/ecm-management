import { DeliveryStatus, type PublishEvent } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PublishEventDeliveryClient } from '../publish-event-delivery.client';
import { PublishEventDeliveryWorkerService } from '../publish-event-delivery-worker.service';

const createPublishEventRecord = (
  overrides: Partial<PublishEvent> = {},
): PublishEvent => ({
  id: 'event-1',
  eventType: 'model-version.published',
  modelVersionId: 'version-1',
  entityId: 'version-1',
  payloadRef: 'model-version/version-1',
  publishedAt: new Date('2026-03-10T00:00:00.000Z'),
  deliveryStatus: DeliveryStatus.PENDING,
  attemptCount: 0,
  maxAttempts: 5,
  lastAttemptAt: null,
  nextAttemptAt: new Date('2026-03-10T00:00:00.000Z'),
  deliveredAt: null,
  lastError: null,
  leaseOwner: null,
  leaseExpiresAt: null,
  ...overrides,
});

describe('PublishEventDeliveryWorkerService', () => {
  function makeService() {
    const prisma = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: jest.fn().mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        return fn(prisma);
      }),
      publishEvent: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    } as unknown as PrismaService;

    const deliveryClient = {
      deliver: jest.fn().mockResolvedValue(undefined),
    } as unknown as PublishEventDeliveryClient;

    return {
      prisma,
      deliveryClient,
      service: new PublishEventDeliveryWorkerService(prisma, deliveryClient),
    };
  }

  it('claims due events and marks them delivered after a successful dispatch', async () => {
    const now = new Date('2026-03-10T01:00:00.000Z');
    const dueEvent = createPublishEventRecord({ id: 'event-1', nextAttemptAt: now });
    const claimedEvent = createPublishEventRecord({
      id: 'event-1',
      leaseOwner: 'worker-1',
      leaseExpiresAt: new Date('2026-03-10T01:00:30.000Z'),
      nextAttemptAt: now,
    });
    const { service, prisma, deliveryClient } = makeService();

    prisma.publishEvent.findMany = jest
      .fn()
      .mockResolvedValueOnce([dueEvent])
      .mockResolvedValueOnce([claimedEvent]);
    prisma.publishEvent.updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await service.processDueEvents({
      batchSize: 10,
      now,
      workerId: 'worker-1',
    });

    expect(prisma.publishEvent.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'event-1',
        deliveryStatus: { in: [DeliveryStatus.PENDING, DeliveryStatus.RETRYING] },
        nextAttemptAt: { lte: now },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      data: {
        leaseOwner: 'worker-1',
        leaseExpiresAt: new Date('2026-03-10T01:00:30.000Z'),
      },
    });
    expect(deliveryClient.deliver).toHaveBeenCalledWith(claimedEvent);
    expect(prisma.publishEvent.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'event-1',
        leaseOwner: 'worker-1',
        deliveryStatus: { in: [DeliveryStatus.PENDING, DeliveryStatus.RETRYING] },
      },
      data: {
        deliveryStatus: DeliveryStatus.DELIVERED,
        attemptCount: 1,
        lastAttemptAt: now,
        nextAttemptAt: null,
        deliveredAt: now,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    expect(result).toEqual({
      claimedCount: 1,
      deliveredCount: 1,
      retriedCount: 0,
      failedCount: 0,
    });
  });

  it('marks failed deliveries for retry with capped exponential backoff', async () => {
    const now = new Date('2026-03-10T01:00:00.000Z');
    const dueEvent = createPublishEventRecord({ id: 'event-2', nextAttemptAt: now });
    const claimedEvent = createPublishEventRecord({
      id: 'event-2',
      leaseOwner: 'worker-2',
      leaseExpiresAt: new Date('2026-03-10T01:00:30.000Z'),
      nextAttemptAt: now,
    });
    const { service, prisma, deliveryClient } = makeService();

    prisma.publishEvent.findMany = jest
      .fn()
      .mockResolvedValueOnce([dueEvent])
      .mockResolvedValueOnce([claimedEvent]);
    prisma.publishEvent.updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    deliveryClient.deliver = jest
      .fn()
      .mockRejectedValue(new Error('Downstream endpoint timed out'));

    const result = await service.processDueEvents({
      now,
      workerId: 'worker-2',
    });

    expect(prisma.publishEvent.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'event-2',
        leaseOwner: 'worker-2',
        deliveryStatus: { in: [DeliveryStatus.PENDING, DeliveryStatus.RETRYING] },
      },
      data: {
        deliveryStatus: DeliveryStatus.RETRYING,
        attemptCount: 1,
        lastAttemptAt: now,
        nextAttemptAt: new Date('2026-03-10T01:00:30.000Z'),
        deliveredAt: null,
        lastError: 'Error: Downstream endpoint timed out',
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    expect(result).toEqual({
      claimedCount: 1,
      deliveredCount: 0,
      retriedCount: 1,
      failedCount: 0,
    });
  });

  it('marks events as failed once the max attempt count is exhausted', async () => {
    const now = new Date('2026-03-10T01:00:00.000Z');
    const dueEvent = createPublishEventRecord({
      id: 'event-3',
      deliveryStatus: DeliveryStatus.RETRYING,
      attemptCount: 2,
      maxAttempts: 3,
      nextAttemptAt: now,
    });
    const claimedEvent = createPublishEventRecord({
      id: 'event-3',
      deliveryStatus: DeliveryStatus.RETRYING,
      attemptCount: 2,
      maxAttempts: 3,
      leaseOwner: 'worker-3',
      leaseExpiresAt: new Date('2026-03-10T01:00:30.000Z'),
      nextAttemptAt: now,
    });
    const { service, prisma, deliveryClient } = makeService();

    prisma.publishEvent.findMany = jest
      .fn()
      .mockResolvedValueOnce([dueEvent])
      .mockResolvedValueOnce([claimedEvent]);
    prisma.publishEvent.updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    deliveryClient.deliver = jest.fn().mockRejectedValue(new Error('Permanent failure'));

    const result = await service.processDueEvents({
      now,
      workerId: 'worker-3',
    });

    expect(prisma.publishEvent.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'event-3',
        leaseOwner: 'worker-3',
        deliveryStatus: { in: [DeliveryStatus.PENDING, DeliveryStatus.RETRYING] },
      },
      data: {
        deliveryStatus: DeliveryStatus.FAILED,
        attemptCount: 3,
        lastAttemptAt: now,
        nextAttemptAt: null,
        deliveredAt: null,
        lastError: 'Error: Permanent failure',
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    expect(result).toEqual({
      claimedCount: 1,
      deliveredCount: 0,
      retriedCount: 0,
      failedCount: 1,
    });
  });
});
