import { NotFoundException } from '@nestjs/common';
import { BranchType, ModelVersionState } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  PublishEventService,
  type PublishEventClient,
} from '../publish-event.service';

describe('PublishEventService', () => {
  function createClient() {
    return {
      modelVersion: {
        findFirst: jest.fn(),
      },
      publishEvent: {
        create: jest.fn(),
      },
    };
  }

  function makeService() {
    const prisma = createClient() as unknown as PrismaService;

    return {
      service: new PublishEventService(prisma),
      prisma,
    };
  }

  it('records capability events against the current main draft', async () => {
    const { service, prisma } = makeService();
    prisma.modelVersion.findFirst = jest.fn().mockResolvedValue({ id: 'draft-1' });
    prisma.publishEvent.create = jest.fn().mockResolvedValue({ id: 'event-1' });

    await service.recordCapabilityEvent({
      eventType: 'capability.reparented',
      capabilityId: 'cap-1',
      payloadRef: 'change-request/cr-1',
    });

    expect(prisma.modelVersion.findFirst).toHaveBeenCalledWith({
      where: {
        branchType: BranchType.MAIN,
        state: ModelVersionState.DRAFT,
      },
      select: { id: true },
    });
    expect(prisma.publishEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: 'capability.reparented',
        modelVersionId: 'draft-1',
        entityId: 'cap-1',
        payloadRef: 'change-request/cr-1',
        deliveryStatus: 'PENDING',
        attemptCount: 0,
        maxAttempts: 5,
        lastAttemptAt: null,
        nextAttemptAt: expect.any(Date),
        deliveredAt: null,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  });

  it('throws when no main draft is available for a capability event', async () => {
    const { service, prisma } = makeService();
    prisma.modelVersion.findFirst = jest.fn().mockResolvedValue(null);

    await expect(
      service.recordCapabilityEvent({
        eventType: 'capability.deleted',
        capabilityId: 'cap-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('records model version events directly against the supplied release', async () => {
    const { service, prisma } = makeService();
    prisma.publishEvent.create = jest.fn().mockResolvedValue({ id: 'event-2' });

    await service.recordModelVersionEvent({
      eventType: 'model-version.published',
      modelVersionId: 'release-1',
      payloadRef: 'model-version/release-1',
    });

    expect(prisma.publishEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: 'model-version.published',
        modelVersionId: 'release-1',
        entityId: 'release-1',
        payloadRef: 'model-version/release-1',
        deliveryStatus: 'PENDING',
        attemptCount: 0,
        maxAttempts: 5,
        lastAttemptAt: null,
        nextAttemptAt: expect.any(Date),
        deliveredAt: null,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  });

  it('uses the provided transaction client when recording events through the helper', async () => {
    const { service, prisma } = makeService();
    const tx = createClient();
    tx.modelVersion.findFirst = jest.fn().mockResolvedValue({ id: 'draft-2' });
    tx.publishEvent.create = jest.fn().mockResolvedValue({ id: 'event-3' });

    await service.forClient(tx as unknown as PublishEventClient).recordCapabilityEvent({
      eventType: 'capability.promoted',
      capabilityId: 'cap-2',
      payloadRef: 'change-request/cr-2',
      maxAttempts: 3,
    });

    expect(tx.modelVersion.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.publishEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'capability.promoted',
        modelVersionId: 'draft-2',
        entityId: 'cap-2',
        payloadRef: 'change-request/cr-2',
        maxAttempts: 3,
      }),
    });
    expect(prisma.modelVersion.findFirst).not.toHaveBeenCalled();
    expect(prisma.publishEvent.create).not.toHaveBeenCalled();
  });
});
