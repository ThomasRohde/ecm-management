import type { Capability } from './capability';
import type { ModelVersion, ModelVersionStateEnum } from './model-version';

/** Delivery lifecycle for a queued downstream publish event. Mirrors Prisma DeliveryStatus. */
export enum DeliveryStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

/** Health indicator for a downstream consumer registration. Mirrors Prisma HealthStatus. */
export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
}

/** Catalog entry for a supported downstream transformation profile. */
export interface TransformationProfileSummary {
  id: string;
  name: string;
  description: string;
  supportedContractTypes: string[];
  defaultSyncMode: string;
}

/** Delivery visibility surfaced alongside a downstream consumer registration. */
export interface DownstreamConsumerStatusSummary {
  lastAttemptAt: string | null;
  lastDeliveredAt: string | null;
  deliveredCount: number;
  failedCount: number;
  lastFailureMessage: string | null;
}

export interface DownstreamConsumer {
  id: string;
  name: string;
  contractType: string;
  syncMode: string;
  transformationProfile: string | null;
  transformationProfileDetails: TransformationProfileSummary | null;
  healthStatus: HealthStatus;
  status: DownstreamConsumerStatusSummary;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDownstreamConsumerInput {
  name: string;
  contractType: string;
  syncMode: string;
  transformationProfile?: string | null;
  healthStatus?: HealthStatus;
}

export interface UpdateDownstreamConsumerInput {
  name?: string;
  contractType?: string;
  syncMode?: string;
  transformationProfile?: string | null;
  healthStatus?: HealthStatus;
}

export interface DownstreamConsumerListResponse {
  items: DownstreamConsumer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DownstreamConsumerHealthSummary {
  totalConsumers: number;
  healthyConsumers: number;
  degradedConsumers: number;
  unhealthyConsumers: number;
  pendingEvents: number;
  retryingEvents: number;
  failedEvents: number;
  deliveredEvents: number;
}

export interface DownstreamConsumerEventLogEntry {
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
}

export interface DownstreamConsumerEventLogResponse {
  items: DownstreamConsumerEventLogEntry[];
  total: number;
}

export interface TransformationProfileListResponse {
  items: TransformationProfileSummary[];
  total: number;
}

export interface PublishEvent {
  id: string;
  eventType: string;
  modelVersionId: string;
  entityId: string;
  payloadRef: string | null;
  publishedAt: string;
  deliveryStatus: DeliveryStatus;
  deliveredAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
}

export interface PublishEventListResponse {
  items: PublishEvent[];
  total: number;
}

export interface PublishedCapabilityListResponse {
  release: ModelVersion;
  items: Capability[];
  total: number;
}

export interface PublishedCapabilitySubtreeResponse
  extends PublishedCapabilityListResponse {
  rootCapabilityId: string;
}

export interface ReleaseDiffEntry {
  capabilityId: string;
  name: string;
  changedFields?: unknown;
  afterSnapshot?: unknown;
  beforeSnapshot?: unknown;
}

export interface ReleaseDiffResponse {
  fromVersion: {
    id: string;
    versionLabel: string;
    state: ModelVersionStateEnum;
  };
  toVersion: {
    id: string;
    versionLabel: string;
    state: ModelVersionStateEnum;
  };
  added: ReleaseDiffEntry[];
  modified: ReleaseDiffEntry[];
  removed: ReleaseDiffEntry[];
  summary: {
    addedCount: number;
    modifiedCount: number;
    removedCount: number;
  };
}
