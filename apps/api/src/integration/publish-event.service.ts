import { Injectable, NotFoundException } from '@nestjs/common';
import { BranchType, DeliveryStatus, ModelVersionState, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PublishEventClient = Pick<Prisma.TransactionClient, 'modelVersion' | 'publishEvent'>;

interface PublishEventWriteOptions {
  client?: PublishEventClient;
  maxAttempts?: number;
}

interface RecordCapabilityEventParams extends PublishEventWriteOptions {
  eventType: string;
  capabilityId: string;
  payloadRef?: string | null;
}

interface RecordModelVersionEventParams extends PublishEventWriteOptions {
  eventType: string;
  modelVersionId: string;
  entityId?: string;
  payloadRef?: string | null;
}

export interface PublishEventRecorder {
  recordCapabilityEvent(params: Omit<RecordCapabilityEventParams, 'client'>): Promise<unknown>;
  recordModelVersionEvent(params: Omit<RecordModelVersionEventParams, 'client'>): Promise<unknown>;
}

@Injectable()
export class PublishEventService {
  private readonly defaultMaxAttempts = 5;

  constructor(private readonly prisma: PrismaService) {}

  forClient(client: PublishEventClient): PublishEventRecorder {
    return {
      recordCapabilityEvent: (params) => this.recordCapabilityEvent({ ...params, client }),
      recordModelVersionEvent: (params) => this.recordModelVersionEvent({ ...params, client }),
    };
  }

  async recordCapabilityEvent(params: RecordCapabilityEventParams) {
    const client = this.resolveClient(params.client);
    const draft = await client.modelVersion.findFirst({
      where: {
        branchType: BranchType.MAIN,
        state: ModelVersionState.DRAFT,
      },
      select: { id: true },
    });

    if (!draft) {
      throw new NotFoundException(
        'No active MAIN draft is available to attach capability publish events',
      );
    }

    return this.createOutboxRecord(client, {
      eventType: params.eventType,
      modelVersionId: draft.id,
      entityId: params.capabilityId,
      payloadRef: params.payloadRef ?? null,
      maxAttempts: params.maxAttempts,
    });
  }

  async recordModelVersionEvent(params: RecordModelVersionEventParams) {
    return this.createOutboxRecord(this.resolveClient(params.client), {
      eventType: params.eventType,
      modelVersionId: params.modelVersionId,
      entityId: params.entityId ?? params.modelVersionId,
      payloadRef: params.payloadRef ?? null,
      maxAttempts: params.maxAttempts,
    });
  }

  private resolveClient(client?: PublishEventClient): PublishEventClient {
    return client ?? this.prisma;
  }

  private createOutboxRecord(
    client: PublishEventClient,
    params: {
      eventType: string;
      modelVersionId: string;
      entityId: string;
      payloadRef: string | null;
      maxAttempts?: number;
    },
  ) {
    return client.publishEvent.create({
      data: {
        eventType: params.eventType,
        modelVersionId: params.modelVersionId,
        entityId: params.entityId,
        payloadRef: params.payloadRef,
        deliveryStatus: DeliveryStatus.PENDING,
        attemptCount: 0,
        maxAttempts: params.maxAttempts ?? this.defaultMaxAttempts,
        lastAttemptAt: null,
        nextAttemptAt: new Date(),
        deliveredAt: null,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  }
}
