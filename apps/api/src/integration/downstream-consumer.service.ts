import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  DeliveryStatus,
  HealthStatus,
  Prisma,
  type AuditEntry,
  type DownstreamConsumer,
  type PublishEvent,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateDownstreamConsumerDto } from './dto/create-downstream-consumer.dto';
import type { ListDownstreamConsumerEventsDto } from './dto/list-downstream-consumer-events.dto';
import type { ListDownstreamConsumersDto } from './dto/list-downstream-consumers.dto';
import type { UpdateDownstreamConsumerDto } from './dto/update-downstream-consumer.dto';
import {
  TransformationProfileService,
  type TransformationProfileDefinition,
} from './transformation-profile.service';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const DEFAULT_EVENT_LOG_LIMIT = 20;
const MAX_LIMIT = 100;
const DELIVERY_AUDIT_ACTOR_ID = 'system:integration-delivery';

export interface DownstreamConsumerStatusSummary {
  lastAttemptAt: string | null;
  lastDeliveredAt: string | null;
  deliveredCount: number;
  failedCount: number;
  lastFailureMessage: string | null;
}

interface DeliveryAuditMetadata {
  consumerName: string | null;
  publishEventId: string;
  modelVersionId: string;
  entityId: string;
  eventType: string;
  deliveryStatus: DeliveryStatus;
  transformationProfile: string | null;
  message: string | null;
  evidence: Record<string, unknown> | null;
}

export interface RecordDownstreamDeliveryAttemptParams {
  consumer: DownstreamConsumer;
  event: PublishEvent;
  deliveryStatus: DeliveryStatus;
  transformationProfile: string | null;
  message: string | null;
  evidence?: Record<string, unknown> | null;
}

@Injectable()
export class DownstreamConsumerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly transformationProfileService: TransformationProfileService,
  ) {}

  async list(query: ListDownstreamConsumersDto) {
    const page = Math.max(DEFAULT_PAGE, query.page ?? DEFAULT_PAGE);
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;
    const where: Prisma.DownstreamConsumerWhereInput = {
      ...(query.healthStatus ? { healthStatus: query.healthStatus } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.downstreamConsumer.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.downstreamConsumer.count({ where }),
    ]);

    const statusByConsumerId = await this.buildStatusSummaryMap(items.map((item) => item.id));

    return {
      items: items.map((item) =>
        this.toResponseConsumer(item, statusByConsumerId.get(item.id) ?? this.emptyStatusSummary()),
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const consumer = await this.prisma.downstreamConsumer.findUnique({
      where: { id },
    });
    if (!consumer) {
      throw new NotFoundException(`Downstream consumer "${id}" was not found.`);
    }

    const statusByConsumerId = await this.buildStatusSummaryMap([id]);
    return this.toResponseConsumer(
      consumer,
      statusByConsumerId.get(id) ?? this.emptyStatusSummary(),
    );
  }

  async create(dto: CreateDownstreamConsumerDto, actorId: string) {
    const name = this.requireNonBlank(dto.name, 'name');
    const contractType = this.requireNonBlank(dto.contractType, 'contractType');
    const syncMode = this.requireNonBlank(dto.syncMode, 'syncMode');
    const transformationProfile = this.transformationProfileService.resolveProfile(
      dto.transformationProfile,
      contractType,
    );

    try {
      const consumer = await this.prisma.downstreamConsumer.create({
        data: {
          name,
          contractType,
          syncMode,
          transformationProfile: transformationProfile.id,
          healthStatus: dto.healthStatus ?? HealthStatus.HEALTHY,
        },
      });

      void this.auditService.record({
        entityType: AuditEntityType.DOWNSTREAM_CONSUMER,
        entityId: consumer.id,
        action: AuditAction.CREATE,
        actorId,
        after: this.serializeConsumerForAudit(consumer),
      });

      return this.findOne(consumer.id);
    } catch (error) {
      this.rethrowUniqueConstraint(error, name);
      throw error;
    }
  }

  async update(id: string, dto: UpdateDownstreamConsumerDto, actorId: string) {
    if (
      dto.name === undefined &&
      dto.contractType === undefined &&
      dto.syncMode === undefined &&
      dto.transformationProfile === undefined &&
      dto.healthStatus === undefined
    ) {
      throw new BadRequestException('No updatable fields were provided.');
    }

    const existing = await this.getRecordOrThrow(id);
    const nextName =
      dto.name !== undefined ? this.requireNonBlank(dto.name, 'name') : existing.name;
    const nextContractType =
      dto.contractType !== undefined
        ? this.requireNonBlank(dto.contractType, 'contractType')
        : existing.contractType;
    const nextSyncMode =
      dto.syncMode !== undefined
        ? this.requireNonBlank(dto.syncMode, 'syncMode')
        : existing.syncMode;
    const nextHealthStatus = dto.healthStatus ?? existing.healthStatus;
    const transformationProfile = this.transformationProfileService.resolveProfile(
      dto.transformationProfile !== undefined
        ? dto.transformationProfile
        : existing.transformationProfile,
      nextContractType,
    );

    try {
      const updated = await this.prisma.downstreamConsumer.update({
        where: { id },
        data: {
          name: nextName,
          contractType: nextContractType,
          syncMode: nextSyncMode,
          transformationProfile: transformationProfile.id,
          healthStatus: nextHealthStatus,
        },
      });

      void this.auditService.record({
        entityType: AuditEntityType.DOWNSTREAM_CONSUMER,
        entityId: updated.id,
        action: AuditAction.UPDATE,
        actorId,
        before: this.serializeConsumerForAudit(existing),
        after: this.serializeConsumerForAudit(updated),
      });

      return this.findOne(updated.id);
    } catch (error) {
      this.rethrowUniqueConstraint(error, nextName);
      throw error;
    }
  }

  async delete(id: string, actorId: string): Promise<void> {
    const existing = await this.getRecordOrThrow(id);

    try {
      await this.prisma.downstreamConsumer.delete({
        where: { id },
      });
    } catch (error) {
      this.rethrowNotFound(error, id);
      throw error;
    }

    void this.auditService.record({
      entityType: AuditEntityType.DOWNSTREAM_CONSUMER,
      entityId: id,
      action: AuditAction.DELETE,
      actorId,
      before: this.serializeConsumerForAudit(existing),
    });
  }

  async getHealthSummary() {
    const [
      totalConsumers,
      healthyConsumers,
      degradedConsumers,
      unhealthyConsumers,
      pendingEvents,
      retryingEvents,
      failedEvents,
      deliveredEvents,
    ] = await this.prisma.$transaction([
      this.prisma.downstreamConsumer.count(),
      this.prisma.downstreamConsumer.count({
        where: { healthStatus: HealthStatus.HEALTHY },
      }),
      this.prisma.downstreamConsumer.count({
        where: { healthStatus: HealthStatus.DEGRADED },
      }),
      this.prisma.downstreamConsumer.count({
        where: { healthStatus: HealthStatus.UNHEALTHY },
      }),
      this.prisma.publishEvent.count({
        where: { deliveryStatus: DeliveryStatus.PENDING },
      }),
      this.prisma.publishEvent.count({
        where: { deliveryStatus: DeliveryStatus.RETRYING },
      }),
      this.prisma.publishEvent.count({
        where: { deliveryStatus: DeliveryStatus.FAILED },
      }),
      this.prisma.publishEvent.count({
        where: { deliveryStatus: DeliveryStatus.DELIVERED },
      }),
    ]);

    return {
      totalConsumers,
      healthyConsumers,
      degradedConsumers,
      unhealthyConsumers,
      pendingEvents,
      retryingEvents,
      failedEvents,
      deliveredEvents,
    };
  }

  async listEventLog(query: ListDownstreamConsumerEventsDto) {
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_EVENT_LOG_LIMIT));
    const offset = Math.max(0, query.offset ?? 0);
    const where: Prisma.AuditEntryWhereInput = {
      entityType: AuditEntityType.DOWNSTREAM_CONSUMER,
      action: AuditAction.PUBLISH,
      ...(query.consumerId ? { entityId: query.consumerId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditEntry.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditEntry.count({ where }),
    ]);

    return {
      items: items
        .map((item) => this.toEventLogEntry(item))
        .filter(
          (
            item,
          ): item is {
            auditId: string;
            consumerId: string;
            consumerName: string;
            publishEventId: string;
            modelVersionId: string;
            entityId: string;
            eventType: string;
            deliveryStatus: DeliveryStatus;
            attemptedAt: string;
            transformationProfile: string | null;
            message: string | null;
            evidence: Record<string, unknown> | null;
          } => item !== null,
        ),
      total,
    };
  }

  listTransformationProfiles() {
    const items = this.transformationProfileService.listProfiles();
    return {
      items,
      total: items.length,
    };
  }

  async listRegisteredConsumers(): Promise<DownstreamConsumer[]> {
    return this.prisma.downstreamConsumer.findMany({
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });
  }

  async recordDeliveryAttempt(params: RecordDownstreamDeliveryAttemptParams): Promise<void> {
    await this.auditService.record({
      entityType: AuditEntityType.DOWNSTREAM_CONSUMER,
      entityId: params.consumer.id,
      action: AuditAction.PUBLISH,
      actorId: DELIVERY_AUDIT_ACTOR_ID,
      metadata: {
        consumerName: params.consumer.name,
        contractType: params.consumer.contractType,
        syncMode: params.consumer.syncMode,
        publishEventId: params.event.id,
        modelVersionId: params.event.modelVersionId,
        entityId: params.event.entityId,
        eventType: params.event.eventType,
        deliveryStatus: params.deliveryStatus,
        transformationProfile: params.transformationProfile,
        message: params.message,
        evidence: params.evidence ?? null,
      },
    });
  }

  private async getRecordOrThrow(id: string): Promise<DownstreamConsumer> {
    const consumer = await this.prisma.downstreamConsumer.findUnique({
      where: { id },
    });
    if (!consumer) {
      throw new NotFoundException(`Downstream consumer "${id}" was not found.`);
    }

    return consumer;
  }

  private toResponseConsumer(
    consumer: DownstreamConsumer,
    status: DownstreamConsumerStatusSummary,
  ) {
    const transformationProfileDetails = this.transformationProfileService.findProfile(
      consumer.transformationProfile,
      consumer.contractType,
    );

    return {
      id: consumer.id,
      name: consumer.name,
      contractType: consumer.contractType,
      syncMode: consumer.syncMode,
      transformationProfile:
        consumer.transformationProfile ??
        this.transformationProfileService.getDefaultProfileId(consumer.contractType),
      transformationProfileDetails: transformationProfileDetails
        ? this.serializeTransformationProfile(transformationProfileDetails)
        : null,
      healthStatus: consumer.healthStatus,
      status,
      createdAt: consumer.createdAt.toISOString(),
      updatedAt: consumer.updatedAt.toISOString(),
    };
  }

  private serializeTransformationProfile(
    profile: TransformationProfileDefinition,
  ): TransformationProfileDefinition {
    return {
      ...profile,
      supportedContractTypes: [...profile.supportedContractTypes],
    };
  }

  private async buildStatusSummaryMap(
    consumerIds: string[],
  ): Promise<Map<string, DownstreamConsumerStatusSummary>> {
    const summaryMap = new Map<string, DownstreamConsumerStatusSummary>();
    if (consumerIds.length === 0) {
      return summaryMap;
    }

    const entries = await this.prisma.auditEntry.findMany({
      where: {
        entityType: AuditEntityType.DOWNSTREAM_CONSUMER,
        action: AuditAction.PUBLISH,
        entityId: { in: consumerIds },
      },
      orderBy: { timestamp: 'desc' },
    });

    for (const entry of entries) {
      const metadata = this.parseDeliveryAuditMetadata(entry);
      if (!metadata) {
        continue;
      }

      const currentSummary =
        summaryMap.get(entry.entityId) ?? this.emptyStatusSummary();

      if (!currentSummary.lastAttemptAt) {
        currentSummary.lastAttemptAt = entry.timestamp.toISOString();
      }

      if (metadata.deliveryStatus === DeliveryStatus.DELIVERED) {
        currentSummary.deliveredCount += 1;
        if (!currentSummary.lastDeliveredAt) {
          currentSummary.lastDeliveredAt = entry.timestamp.toISOString();
        }
      } else {
        currentSummary.failedCount += 1;
        if (!currentSummary.lastFailureMessage) {
          currentSummary.lastFailureMessage = metadata.message;
        }
      }

      summaryMap.set(entry.entityId, currentSummary);
    }

    return summaryMap;
  }

  private emptyStatusSummary(): DownstreamConsumerStatusSummary {
    return {
      lastAttemptAt: null,
      lastDeliveredAt: null,
      deliveredCount: 0,
      failedCount: 0,
      lastFailureMessage: null,
    };
  }

  private toEventLogEntry(auditEntry: AuditEntry) {
    const metadata = this.parseDeliveryAuditMetadata(auditEntry);
    if (!metadata) {
      return null;
    }

    return {
      auditId: auditEntry.id,
      consumerId: auditEntry.entityId,
      consumerName: metadata.consumerName ?? auditEntry.entityId,
      publishEventId: metadata.publishEventId,
      modelVersionId: metadata.modelVersionId,
      entityId: metadata.entityId,
      eventType: metadata.eventType,
      deliveryStatus: metadata.deliveryStatus,
      attemptedAt: auditEntry.timestamp.toISOString(),
      transformationProfile: metadata.transformationProfile,
      message: metadata.message,
      evidence: metadata.evidence,
    };
  }

  private parseDeliveryAuditMetadata(auditEntry: AuditEntry): DeliveryAuditMetadata | null {
    if (!isRecord(auditEntry.metadata)) {
      return null;
    }

    const deliveryStatusValue = auditEntry.metadata['deliveryStatus'];
    if (!isDeliveryStatus(deliveryStatusValue)) {
      return null;
    }

    const publishEventId = readString(auditEntry.metadata['publishEventId']);
    const modelVersionId = readString(auditEntry.metadata['modelVersionId']);
    const entityId = readString(auditEntry.metadata['entityId']);
    const eventType = readString(auditEntry.metadata['eventType']);

    if (!publishEventId || !modelVersionId || !entityId || !eventType) {
      return null;
    }

    return {
      consumerName: readString(auditEntry.metadata['consumerName']),
      publishEventId,
      modelVersionId,
      entityId,
      eventType,
      deliveryStatus: deliveryStatusValue,
      transformationProfile: readString(auditEntry.metadata['transformationProfile']),
      message: readString(auditEntry.metadata['message']),
      evidence: isRecord(auditEntry.metadata['evidence'])
        ? auditEntry.metadata['evidence']
        : null,
    };
  }

  private serializeConsumerForAudit(
    consumer: DownstreamConsumer,
  ): Record<string, unknown> {
    return {
      id: consumer.id,
      name: consumer.name,
      contractType: consumer.contractType,
      syncMode: consumer.syncMode,
      transformationProfile: consumer.transformationProfile,
      healthStatus: consumer.healthStatus,
      createdAt: consumer.createdAt.toISOString(),
      updatedAt: consumer.updatedAt.toISOString(),
    };
  }

  private requireNonBlank(value: string, fieldName: string): string {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      throw new BadRequestException(`Field "${fieldName}" must not be blank.`);
    }

    return trimmedValue;
  }

  private rethrowUniqueConstraint(error: unknown, name: string): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `A downstream consumer named "${name}" already exists.`,
      );
    }
  }

  private rethrowNotFound(error: unknown, id: string): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException(`Downstream consumer "${id}" was not found.`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return (
    value === DeliveryStatus.PENDING ||
    value === DeliveryStatus.DELIVERED ||
    value === DeliveryStatus.FAILED ||
    value === DeliveryStatus.RETRYING
  );
}
