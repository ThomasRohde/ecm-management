import { BadRequestException, Injectable } from '@nestjs/common';
import type { DownstreamConsumer, PublishEvent } from '@prisma/client';

export interface TransformationProfileDefinition {
  id: string;
  name: string;
  description: string;
  supportedContractTypes: string[];
  defaultSyncMode: string;
}

export interface PreparedDeliveryPayload {
  profile: TransformationProfileDefinition;
  payload: Record<string, unknown>;
}

const DEFAULT_TRANSFORMATION_PROFILE_ID = 'published-model-v1';

const TRANSFORMATION_PROFILES: TransformationProfileDefinition[] = [
  {
    id: 'published-model-v1',
    name: 'Published model envelope v1',
    description:
      'Wraps publish events in a generic published-model envelope for API and webhook consumers.',
    supportedContractTypes: ['REST_API', 'WEBHOOK', 'FILE_DROP'],
    defaultSyncMode: 'REALTIME',
  },
  {
    id: 'capability-delta-v1',
    name: 'Capability delta envelope v1',
    description:
      'Produces a lightweight capability-change payload for event-stream oriented consumers.',
    supportedContractTypes: ['WEBHOOK', 'EVENT_STREAM', 'KAFKA', 'REST_API'],
    defaultSyncMode: 'REALTIME',
  },
  {
    id: 'release-summary-v1',
    name: 'Release summary envelope v1',
    description:
      'Prepares a release-summary payload for scheduled batch-style downstream synchronizations.',
    supportedContractTypes: ['BATCH_EXPORT', 'FILE_DROP', 'REST_API'],
    defaultSyncMode: 'BATCH_DAILY',
  },
];

const DEFAULT_PROFILE_BY_CONTRACT_TYPE: Record<string, string> = {
  BATCH_EXPORT: 'release-summary-v1',
  EVENT_STREAM: 'capability-delta-v1',
  FILE_DROP: 'release-summary-v1',
  KAFKA: 'capability-delta-v1',
  REST_API: 'published-model-v1',
  WEBHOOK: 'capability-delta-v1',
};

@Injectable()
export class TransformationProfileService {
  listProfiles(): TransformationProfileDefinition[] {
    return TRANSFORMATION_PROFILES.map((profile) => this.cloneProfile(profile));
  }

  getDefaultProfileId(contractType?: string | null): string {
    const normalizedContractType = this.normalizeContractType(contractType);
    if (normalizedContractType) {
      return (
        DEFAULT_PROFILE_BY_CONTRACT_TYPE[normalizedContractType] ??
        DEFAULT_TRANSFORMATION_PROFILE_ID
      );
    }

    return DEFAULT_TRANSFORMATION_PROFILE_ID;
  }

  findProfile(
    profileId?: string | null,
    contractType?: string | null,
  ): TransformationProfileDefinition | null {
    const normalizedProfileId = this.normalizeProfileId(profileId);
    const normalizedContractType = this.normalizeContractType(contractType);
    const effectiveProfileId =
      normalizedProfileId ?? this.getDefaultProfileId(normalizedContractType);

    const profile = TRANSFORMATION_PROFILES.find((candidate) => candidate.id === effectiveProfileId);
    if (!profile) {
      return null;
    }

    if (
      normalizedContractType &&
      !profile.supportedContractTypes.includes(normalizedContractType)
    ) {
      return null;
    }

    return this.cloneProfile(profile);
  }

  resolveProfile(
    profileId?: string | null,
    contractType?: string | null,
  ): TransformationProfileDefinition {
    const profile = this.findProfile(profileId, contractType);
    if (profile) {
      return profile;
    }

    const normalizedProfileId = this.normalizeProfileId(profileId);
    const normalizedContractType = this.normalizeContractType(contractType);

    if (normalizedProfileId) {
      throw new BadRequestException(
        `Transformation profile "${normalizedProfileId}" is not supported for contract type "${normalizedContractType ?? 'UNKNOWN'}".`,
      );
    }

    const fallback = this.findProfile(null, normalizedContractType);
    if (!fallback) {
      throw new BadRequestException(
        `No default transformation profile is configured for contract type "${normalizedContractType ?? 'UNKNOWN'}".`,
      );
    }

    return fallback;
  }

  buildPayload(params: {
    consumer: DownstreamConsumer;
    event: PublishEvent;
  }): PreparedDeliveryPayload {
    const profile = this.resolveProfile(
      params.consumer.transformationProfile,
      params.consumer.contractType,
    );
    const publishedAt = params.event.publishedAt.toISOString();

    switch (profile.id) {
      case 'capability-delta-v1':
        return {
          profile,
          payload: {
            schema: 'capability-delta.v1',
            consumer: this.buildConsumerEnvelope(params.consumer),
            event: this.buildEventEnvelope(params.event, publishedAt),
            delta: {
              capabilityId: params.event.entityId,
              eventType: params.event.eventType,
              payloadRef: params.event.payloadRef,
            },
          },
        };
      case 'release-summary-v1':
        return {
          profile,
          payload: {
            schema: 'release-summary.v1',
            consumer: this.buildConsumerEnvelope(params.consumer),
            event: this.buildEventEnvelope(params.event, publishedAt),
            release: {
              modelVersionId: params.event.modelVersionId,
              syncMode: params.consumer.syncMode,
              payloadRef: params.event.payloadRef,
            },
          },
        };
      case 'published-model-v1':
      default:
        return {
          profile,
          payload: {
            schema: 'published-model.v1',
            consumer: this.buildConsumerEnvelope(params.consumer),
            event: this.buildEventEnvelope(params.event, publishedAt),
            publishedModel: {
              modelVersionId: params.event.modelVersionId,
              entityId: params.event.entityId,
              payloadRef: params.event.payloadRef,
            },
          },
        };
    }
  }

  private buildConsumerEnvelope(consumer: DownstreamConsumer): Record<string, unknown> {
    return {
      id: consumer.id,
      name: consumer.name,
      contractType: consumer.contractType,
      syncMode: consumer.syncMode,
    };
  }

  private buildEventEnvelope(event: PublishEvent, publishedAt: string): Record<string, unknown> {
    return {
      publishEventId: event.id,
      eventType: event.eventType,
      modelVersionId: event.modelVersionId,
      entityId: event.entityId,
      payloadRef: event.payloadRef,
      publishedAt,
    };
  }

  private cloneProfile(
    profile: TransformationProfileDefinition,
  ): TransformationProfileDefinition {
    return {
      ...profile,
      supportedContractTypes: [...profile.supportedContractTypes],
    };
  }

  private normalizeContractType(value?: string | null): string | null {
    if (value == null) {
      return null;
    }

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue.toUpperCase() : null;
  }

  private normalizeProfileId(value?: string | null): string | null {
    if (value == null) {
      return null;
    }

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue.toLowerCase() : null;
  }
}
