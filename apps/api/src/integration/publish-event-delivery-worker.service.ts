import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DeliveryStatus, Prisma, type PublishEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublishEventDeliveryClient } from './publish-event-delivery.client';

type TxClient = Prisma.TransactionClient;

const CLAIMABLE_STATUSES = [DeliveryStatus.PENDING, DeliveryStatus.RETRYING] as const;

export interface ProcessDuePublishEventsOptions {
  batchSize?: number;
  now?: Date;
  workerId?: string;
}

export interface ProcessDuePublishEventsResult {
  claimedCount: number;
  deliveredCount: number;
  retriedCount: number;
  failedCount: number;
}

@Injectable()
export class PublishEventDeliveryWorkerService {
  private readonly logger = new Logger(PublishEventDeliveryWorkerService.name);
  private readonly defaultBatchSize = 25;
  private readonly leaseDurationMs = 30_000;
  private readonly baseRetryDelayMs = 30_000;
  private readonly maxRetryDelayMs = 15 * 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryClient: PublishEventDeliveryClient,
  ) {}

  async processDueEvents(
    options: ProcessDuePublishEventsOptions = {},
  ): Promise<ProcessDuePublishEventsResult> {
    const now = options.now ?? new Date();
    const workerId = options.workerId ?? `publish-event-worker:${randomUUID()}`;
    const claimedEvents = await this.claimDueEvents({
      batchSize: options.batchSize ?? this.defaultBatchSize,
      now,
      workerId,
    });

    const result: ProcessDuePublishEventsResult = {
      claimedCount: claimedEvents.length,
      deliveredCount: 0,
      retriedCount: 0,
      failedCount: 0,
    };

    for (const event of claimedEvents) {
      const attemptedAt = options.now ?? new Date();

      try {
        await this.deliveryClient.deliver(event);
        if (await this.markDelivered(event, workerId, attemptedAt)) {
          result.deliveredCount += 1;
        }
      } catch (error) {
        const status = await this.markAttemptFailure(event, workerId, attemptedAt, error);
        if (status === DeliveryStatus.RETRYING) {
          result.retriedCount += 1;
        }
        if (status === DeliveryStatus.FAILED) {
          result.failedCount += 1;
        }
      }
    }

    return result;
  }

  private async claimDueEvents(params: {
    batchSize: number;
    now: Date;
    workerId: string;
  }): Promise<PublishEvent[]> {
    const leaseExpiresAt = new Date(params.now.getTime() + this.leaseDurationMs);

    return this.prisma.$transaction(async (tx: TxClient) => {
      const candidates = await tx.publishEvent.findMany({
        where: this.buildDueEventWhere(params.now),
        orderBy: [{ nextAttemptAt: 'asc' }, { publishedAt: 'asc' }],
        take: params.batchSize,
      });

      const claimedIds: string[] = [];

      for (const candidate of candidates) {
        const claim = await tx.publishEvent.updateMany({
          where: {
            ...this.buildDueEventWhere(params.now),
            id: candidate.id,
          },
          data: {
            leaseOwner: params.workerId,
            leaseExpiresAt,
          },
        });

        if (claim.count === 1) {
          claimedIds.push(candidate.id);
        }
      }

      if (claimedIds.length === 0) {
        return [];
      }

      return tx.publishEvent.findMany({
        where: {
          id: { in: claimedIds },
          leaseOwner: params.workerId,
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { publishedAt: 'asc' }],
      });
    });
  }

  private buildDueEventWhere(now: Date): Prisma.PublishEventWhereInput {
    return {
      deliveryStatus: { in: [...CLAIMABLE_STATUSES] },
      nextAttemptAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    };
  }

  private async markDelivered(
    event: PublishEvent,
    workerId: string,
    attemptedAt: Date,
  ): Promise<boolean> {
    const updated = await this.prisma.publishEvent.updateMany({
      where: {
        id: event.id,
        leaseOwner: workerId,
        deliveryStatus: { in: [...CLAIMABLE_STATUSES] },
      },
      data: {
        deliveryStatus: DeliveryStatus.DELIVERED,
        attemptCount: event.attemptCount + 1,
        lastAttemptAt: attemptedAt,
        nextAttemptAt: null,
        deliveredAt: attemptedAt,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });

    if (updated.count !== 1) {
      this.logger.warn(`Lost lease while marking publish event ${event.id} as delivered`);
      return false;
    }

    return true;
  }

  private async markAttemptFailure(
    event: PublishEvent,
    workerId: string,
    attemptedAt: Date,
    error: unknown,
  ): Promise<DeliveryStatus | null> {
    const attemptCount = event.attemptCount + 1;
    const shouldRetry = attemptCount < event.maxAttempts;
    const nextStatus = shouldRetry ? DeliveryStatus.RETRYING : DeliveryStatus.FAILED;
    const updated = await this.prisma.publishEvent.updateMany({
      where: {
        id: event.id,
        leaseOwner: workerId,
        deliveryStatus: { in: [...CLAIMABLE_STATUSES] },
      },
      data: {
        deliveryStatus: nextStatus,
        attemptCount,
        lastAttemptAt: attemptedAt,
        nextAttemptAt: shouldRetry
          ? this.computeNextAttemptAt(attemptedAt, attemptCount)
          : null,
        deliveredAt: null,
        lastError: this.formatError(error),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });

    if (updated.count !== 1) {
      this.logger.warn(`Lost lease while updating failed publish event ${event.id}`);
      return null;
    }

    return nextStatus;
  }

  private computeNextAttemptAt(attemptedAt: Date, attemptCount: number): Date {
    const backoffMs = Math.min(
      this.baseRetryDelayMs * 2 ** Math.max(0, attemptCount - 1),
      this.maxRetryDelayMs,
    );

    return new Date(attemptedAt.getTime() + backoffMs);
  }

  private formatError(error: unknown): string {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof error === 'string'
          ? error
          : String(error);

    return message.slice(0, 1_000);
  }
}
