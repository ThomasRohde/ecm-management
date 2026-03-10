/**
 * Phase 9B – Notifications & Tasks shared contracts.
 *
 * These types mirror the Prisma `TaskOrNotification` model and its enums.
 * Per PRD § 12, notifications and tasks share the same table; the `eventType`
 * field determines whether a record requires user action (task) or is purely
 * informational (notification).
 */

import type { AuditEntityType } from './audit';

/** Notification trigger events – mirrors Prisma NotificationEventType. */
export enum NotificationEventType {
  CHANGE_REQUEST_SUBMITTED = 'CHANGE_REQUEST_SUBMITTED',
  CHANGE_REQUEST_APPROVED = 'CHANGE_REQUEST_APPROVED',
  CHANGE_REQUEST_REJECTED = 'CHANGE_REQUEST_REJECTED',
  METADATA_CHANGED = 'METADATA_CHANGED',
  MODEL_PUBLISHED = 'MODEL_PUBLISHED',
  MODEL_ROLLED_BACK = 'MODEL_ROLLED_BACK',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
}

/** Lifecycle state of a single notification / task. Mirrors Prisma NotificationStatus. */
export enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
  DISMISSED = 'DISMISSED',
}

/** Unified notification + task record per PRD § 12. */
export interface TaskOrNotification {
  id: string;
  eventType: NotificationEventType;
  recipientId: string;
  entityType?: AuditEntityType | null;
  /** Soft reference to the related entity (not a FK – entity may be deleted). */
  entityId?: string | null;
  status: NotificationStatus;
  title: string;
  body?: string | null;
  /** Arbitrary payload for the notification-rendering layer (e.g. deep-link data). */
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  readAt?: string | null;
}

// ─── Query / response shapes ─────────────────────────────────────────────────

export interface NotificationListResponse {
  items: TaskOrNotification[];
  total: number;
  unreadCount: number;
}

export interface QueryNotificationsInput {
  recipientId: string;
  status?: NotificationStatus;
  eventType?: NotificationEventType;
  limit?: number;
  offset?: number;
}
