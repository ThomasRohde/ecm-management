/**
 * NotificationService (Phase 9B)
 *
 * Creates and manages TaskOrNotification records.
 *
 * Responsibilities:
 *  - create()          – insert a new UNREAD notification / task
 *  - listForRecipient() – paginated query for a recipient's inbox
 *  - markRead()        – transition UNREAD → READ (with readAt timestamp)
 *  - dismiss()         – transition any state → DISMISSED
 *  - markAllRead()     – bulk UNREAD → READ for a recipient
 *
 * Ownership note: markRead / dismiss require the caller to supply
 * `recipientId` so we can verify ownership before mutating.  A future
 * Phase 9A auth-integration slice will derive recipientId from the JWT
 * instead.
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditEntityType,
  NotificationEventType,
  NotificationStatus,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { QueryNotificationsDto } from './dto/query-notifications.dto';

// ─── Public param shape ───────────────────────────────────────────────────────

export interface CreateNotificationParams {
  eventType: NotificationEventType;
  /** Must be a valid User.id (FK enforced at DB level). */
  recipientId: string;
  entityType?: AuditEntityType;
  /** Soft reference – entity may be deleted later. */
  entityId?: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Write ──────────────────────────────────────────────────────────────────

  /**
   * Create a new UNREAD notification.  Called by domain services (e.g.
   * ChangeRequestService) after a significant workflow event.
   */
  async create(params: CreateNotificationParams): Promise<void> {
    await this.prisma.taskOrNotification.create({
      data: {
        eventType: params.eventType,
        recipientId: params.recipientId,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        title: params.title,
        body: params.body ?? null,
        metadata: params.metadata
          ? (params.metadata as Prisma.InputJsonValue)
          : undefined,
        status: NotificationStatus.UNREAD,
      },
    });
  }

  /**
   * Mark a notification as READ.
   * - Idempotent if already READ.
   * - Throws BadRequestException if already DISMISSED.
   */
  async markRead(id: string, recipientId: string): Promise<void> {
    const notification = await this.findOwned(id, recipientId);

    if (notification.status === NotificationStatus.DISMISSED) {
      throw new BadRequestException('Cannot mark a dismissed notification as read');
    }
    if (notification.status === NotificationStatus.READ) return; // idempotent

    await this.prisma.taskOrNotification.update({
      where: { id },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
  }

  /**
   * Dismiss a notification.  Once dismissed it cannot transition to another state.
   * Idempotent if already DISMISSED.
   */
  async dismiss(id: string, recipientId: string): Promise<void> {
    await this.findOwned(id, recipientId); // ownership check

    await this.prisma.taskOrNotification.update({
      where: { id },
      data: { status: NotificationStatus.DISMISSED },
    });
  }

  /**
   * Bulk-mark all UNREAD notifications for `recipientId` as READ.
   *
   * @returns Number of rows updated.
   */
  async markAllRead(recipientId: string): Promise<{ updated: number }> {
    const result = await this.prisma.taskOrNotification.updateMany({
      where: { recipientId, status: NotificationStatus.UNREAD },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
    return { updated: result.count };
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * List notifications for a recipient, newest-first.
   *
   * @returns `{ items, total, unreadCount }` – unreadCount is always the
   * full UNREAD count regardless of the applied status filter.
   */
  async listForRecipient(dto: QueryNotificationsDto) {
    const baseWhere = { recipientId: dto.recipientId };
    const filteredWhere = {
      ...baseWhere,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.eventType ? { eventType: dto.eventType } : {}),
    };

    const limit = dto.limit ?? 50;
    const offset = dto.offset ?? 0;

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.taskOrNotification.findMany({
        where: filteredWhere,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.taskOrNotification.count({ where: filteredWhere }),
      this.prisma.taskOrNotification.count({
        where: { recipientId: dto.recipientId, status: NotificationStatus.UNREAD },
      }),
    ]);

    return { items, total, unreadCount };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async findOwned(id: string, recipientId: string) {
    const notification = await this.prisma.taskOrNotification.findFirst({
      where: { id, recipientId },
    });
    if (!notification) {
      throw new NotFoundException(
        `Notification "${id}" not found for recipient "${recipientId}"`,
      );
    }
    return notification;
  }
}
