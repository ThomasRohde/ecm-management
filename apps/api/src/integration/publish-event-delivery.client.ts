import { Injectable } from '@nestjs/common';
import {
  DeliveryStatus,
  HealthStatus,
  type DownstreamConsumer,
  type PublishEvent,
} from '@prisma/client';
import { DownstreamConsumerService } from './downstream-consumer.service';
import { TransformationProfileService } from './transformation-profile.service';

export abstract class PublishEventDeliveryClient {
  abstract deliver(event: PublishEvent): Promise<void>;
}

@Injectable()
export class NoopPublishEventDeliveryClient extends PublishEventDeliveryClient {
  async deliver(event: PublishEvent): Promise<void> {
    void event;
  }
}

@Injectable()
export class DownstreamConsumerPublishEventDeliveryClient extends PublishEventDeliveryClient {
  constructor(
    private readonly downstreamConsumerService: DownstreamConsumerService,
    private readonly transformationProfileService: TransformationProfileService,
  ) {
    super();
  }

  async deliver(event: PublishEvent): Promise<void> {
    const consumers = await this.downstreamConsumerService.listRegisteredConsumers();
    if (consumers.length === 0) {
      return;
    }

    const failures: string[] = [];

    for (const consumer of consumers) {
      let transformationProfileId = consumer.transformationProfile;

      try {
        const transformed = this.transformationProfileService.buildPayload({
          consumer,
          event,
        });
        transformationProfileId = transformed.profile.id;

        if (consumer.healthStatus === HealthStatus.UNHEALTHY) {
          const message = `Consumer "${consumer.name}" is marked UNHEALTHY and is blocking delivery.`;
          await this.downstreamConsumerService.recordDeliveryAttempt({
            consumer,
            event,
            deliveryStatus: DeliveryStatus.FAILED,
            transformationProfile: transformed.profile.id,
            message,
            evidence: {
              reason: 'consumer-unhealthy',
              payloadSchema: this.readPayloadSchema(transformed.payload),
            },
          });
          failures.push(message);
          continue;
        }

        await this.deliverToRegisteredConsumer(consumer, transformed.payload);
        await this.downstreamConsumerService.recordDeliveryAttempt({
          consumer,
          event,
          deliveryStatus: DeliveryStatus.DELIVERED,
          transformationProfile: transformed.profile.id,
          message:
            consumer.healthStatus === HealthStatus.DEGRADED
              ? `Delivered while consumer "${consumer.name}" is marked DEGRADED.`
              : 'Delivered to scaffolded downstream transport.',
          evidence: {
            payloadSchema: this.readPayloadSchema(transformed.payload),
            contractType: consumer.contractType,
            syncMode: consumer.syncMode,
          },
        });
      } catch (error) {
        const message = `Failed to deliver to consumer "${consumer.name}": ${this.formatError(error)}`;
        await this.downstreamConsumerService.recordDeliveryAttempt({
          consumer,
          event,
          deliveryStatus: DeliveryStatus.FAILED,
          transformationProfile: transformationProfileId,
          message,
        });
        failures.push(message);
      }
    }

    if (failures.length > 0) {
      throw new Error(failures.join('; '));
    }
  }

  private async deliverToRegisteredConsumer(
    consumer: DownstreamConsumer,
    payload: Record<string, unknown>,
  ): Promise<void> {
    void consumer;
    void payload;
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private readPayloadSchema(payload: Record<string, unknown>): string | null {
    const schema = payload['schema'];
    return typeof schema === 'string' ? schema : null;
  }
}
