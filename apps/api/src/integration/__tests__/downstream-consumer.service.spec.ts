import {
  AuditAction,
  AuditEntityType,
  DeliveryStatus,
  HealthStatus,
  type AuditEntry,
  type DownstreamConsumer,
} from '@prisma/client';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { DownstreamConsumerService } from '../downstream-consumer.service';
import { TransformationProfileService } from '../transformation-profile.service';

function createDownstreamConsumerRecord(
  overrides: Partial<DownstreamConsumer> = {},
): DownstreamConsumer {
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

function createAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'audit-1',
    entityType: AuditEntityType.DOWNSTREAM_CONSUMER,
    entityId: 'consumer-1',
    action: AuditAction.PUBLISH,
    actorId: 'system:integration-delivery',
    before: null,
    after: null,
    metadata: {
      consumerName: 'ServiceNow',
      publishEventId: 'event-1',
      modelVersionId: 'version-1',
      entityId: 'capability-1',
      eventType: 'capability.updated',
      deliveryStatus: DeliveryStatus.DELIVERED,
      transformationProfile: 'published-model-v1',
      message: 'Delivered successfully.',
      evidence: {
        payloadSchema: 'published-model.v1',
      },
    },
    timestamp: new Date('2026-03-10T10:00:00.000Z'),
    ...overrides,
  };
}

describe('DownstreamConsumerService', () => {
  function makeService() {
    const prisma = {
      $transaction: jest.fn().mockImplementation((operations: unknown[] | ((tx: unknown) => Promise<unknown>)) => {
        if (Array.isArray(operations)) {
          return Promise.all(operations as Promise<unknown>[]);
        }

        return operations(prisma);
      }),
      downstreamConsumer: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      publishEvent: {
        count: jest.fn(),
      },
      auditEntry: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    } as unknown as PrismaService;

    const auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    const transformationProfileService = new TransformationProfileService();

    return {
      prisma,
      auditService,
      transformationProfileService,
      service: new DownstreamConsumerService(
        prisma,
        auditService,
        transformationProfileService,
      ),
    };
  }

  it('lists consumers with delivery status summaries and transformation details', async () => {
    const { service, prisma } = makeService();
    const consumer = createDownstreamConsumerRecord();
    const deliveredAudit = createAuditEntry();
    const failedAudit = createAuditEntry({
      id: 'audit-2',
      timestamp: new Date('2026-03-10T09:00:00.000Z'),
      metadata: {
        consumerName: 'ServiceNow',
        publishEventId: 'event-2',
        modelVersionId: 'version-1',
        entityId: 'capability-2',
        eventType: 'capability.retired',
        deliveryStatus: DeliveryStatus.FAILED,
        transformationProfile: 'published-model-v1',
        message: 'Consumer is marked UNHEALTHY.',
        evidence: null,
      },
    });

    prisma.downstreamConsumer.findMany = jest.fn().mockResolvedValue([consumer]);
    prisma.downstreamConsumer.count = jest.fn().mockResolvedValue(1);
    prisma.auditEntry.findMany = jest
      .fn()
      .mockResolvedValue([deliveredAudit, failedAudit]);

    const result = await service.list({ page: 1, limit: 25 });

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 'consumer-1',
          name: 'ServiceNow',
          transformationProfile: 'published-model-v1',
          transformationProfileDetails: expect.objectContaining({
            id: 'published-model-v1',
          }),
          healthStatus: HealthStatus.HEALTHY,
          status: {
            lastAttemptAt: '2026-03-10T10:00:00.000Z',
            lastDeliveredAt: '2026-03-10T10:00:00.000Z',
            deliveredCount: 1,
            failedCount: 1,
            lastFailureMessage: 'Consumer is marked UNHEALTHY.',
          },
        }),
      ],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    });
  });

  it('creates a consumer with a compatible default transformation profile', async () => {
    const { service, prisma, auditService } = makeService();
    const createdConsumer = createDownstreamConsumerRecord();

    prisma.downstreamConsumer.create = jest.fn().mockResolvedValue(createdConsumer);
    prisma.downstreamConsumer.findUnique = jest.fn().mockResolvedValue(createdConsumer);
    prisma.auditEntry.findMany = jest.fn().mockResolvedValue([]);

    const result = await service.create(
      {
        name: '  ServiceNow  ',
        contractType: 'REST_API',
        syncMode: 'REALTIME',
      },
      'user-1',
    );

    expect(prisma.downstreamConsumer.create).toHaveBeenCalledWith({
      data: {
        name: 'ServiceNow',
        contractType: 'REST_API',
        syncMode: 'REALTIME',
        transformationProfile: 'published-model-v1',
        healthStatus: HealthStatus.HEALTHY,
      },
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditEntityType.DOWNSTREAM_CONSUMER,
        entityId: 'consumer-1',
        action: AuditAction.CREATE,
        actorId: 'user-1',
      }),
    );
    expect(result.transformationProfileDetails?.id).toBe('published-model-v1');
  });

  it('returns a consumer health summary backed by queue counts', async () => {
    const { service, prisma } = makeService();

    prisma.downstreamConsumer.count = jest
      .fn()
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    prisma.publishEvent.count = jest
      .fn()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(12);

    const summary = await service.getHealthSummary();

    expect(summary).toEqual({
      totalConsumers: 3,
      healthyConsumers: 1,
      degradedConsumers: 1,
      unhealthyConsumers: 1,
      pendingEvents: 4,
      retryingEvents: 2,
      failedEvents: 1,
      deliveredEvents: 12,
    });
  });

  it('maps publish audit entries into the downstream consumer event log response', async () => {
    const { service, prisma } = makeService();
    const eventLogEntry = createAuditEntry({
      id: 'audit-100',
      metadata: {
        consumerName: 'Analytics Lake',
        publishEventId: 'event-99',
        modelVersionId: 'version-22',
        entityId: 'capability-7',
        eventType: 'model-version.published',
        deliveryStatus: DeliveryStatus.DELIVERED,
        transformationProfile: 'release-summary-v1',
        message: 'Delivered to scaffolded downstream transport.',
        evidence: {
          payloadSchema: 'release-summary.v1',
        },
      },
    });

    prisma.auditEntry.findMany = jest.fn().mockResolvedValue([eventLogEntry]);
    prisma.auditEntry.count = jest.fn().mockResolvedValue(1);

    const result = await service.listEventLog({ limit: 10, offset: 0 });

    expect(result).toEqual({
      items: [
        {
          auditId: 'audit-100',
          consumerId: 'consumer-1',
          consumerName: 'Analytics Lake',
          publishEventId: 'event-99',
          modelVersionId: 'version-22',
          entityId: 'capability-7',
          eventType: 'model-version.published',
          deliveryStatus: DeliveryStatus.DELIVERED,
          attemptedAt: '2026-03-10T10:00:00.000Z',
          transformationProfile: 'release-summary-v1',
          message: 'Delivered to scaffolded downstream transport.',
          evidence: {
            payloadSchema: 'release-summary.v1',
          },
        },
      ],
      total: 1,
    });
  });
});
