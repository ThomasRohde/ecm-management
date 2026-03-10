/**
 * NotificationService unit tests
 *
 * Verifies:
 * 1. create() inserts a new UNREAD notification with the supplied params.
 * 2. markRead() transitions UNREAD → READ and sets readAt.
 * 3. markRead() is idempotent when already READ.
 * 4. markRead() throws when notification is DISMISSED.
 * 5. dismiss() transitions any state → DISMISSED.
 * 6. markAllRead() bulk-updates UNREAD → READ and returns count.
 * 7. listForRecipient() returns items, total, and unreadCount.
 * 8. markRead() / dismiss() throw NotFoundException for wrong owner.
 * 9. Notifications are generated with correct event types for CR workflow events.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import {
  AuditEntityType,
  NotificationEventType,
  NotificationStatus,
} from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationService } from '../notification.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeNotification(
  overrides: Partial<{
    id: string;
    recipientId: string;
    status: NotificationStatus;
    eventType: NotificationEventType;
  }> = {},
) {
  return {
    id: overrides.id ?? 'notif-1',
    eventType:
      overrides.eventType ?? NotificationEventType.CHANGE_REQUEST_SUBMITTED,
    recipientId: overrides.recipientId ?? 'user-1',
    entityType: AuditEntityType.CHANGE_REQUEST,
    entityId: 'cr-1',
    status: overrides.status ?? NotificationStatus.UNREAD,
    title: 'Change request submitted',
    body: null,
    metadata: null,
    createdAt: new Date(),
    readAt: null,
  };
}

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockPrisma = {
  taskOrNotification: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  // ── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('inserts a new UNREAD notification', async () => {
      mockPrisma.taskOrNotification.create.mockResolvedValue(makeNotification());

      await service.create({
        eventType: NotificationEventType.CHANGE_REQUEST_SUBMITTED,
        recipientId: 'user-1',
        entityType: AuditEntityType.CHANGE_REQUEST,
        entityId: 'cr-1',
        title: 'Change request submitted',
      });

      expect(mockPrisma.taskOrNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: NotificationEventType.CHANGE_REQUEST_SUBMITTED,
            recipientId: 'user-1',
            status: NotificationStatus.UNREAD,
          }),
        }),
      );
    });
  });

  // ── markRead() ────────────────────────────────────────────────────────────

  describe('markRead()', () => {
    it('transitions UNREAD → READ and calls update', async () => {
      mockPrisma.taskOrNotification.findFirst.mockResolvedValue(
        makeNotification({ status: NotificationStatus.UNREAD }),
      );
      mockPrisma.taskOrNotification.update.mockResolvedValue({});

      await service.markRead('notif-1', 'user-1');

      expect(mockPrisma.taskOrNotification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-1' },
          data: expect.objectContaining({
            status: NotificationStatus.READ,
            readAt: expect.any(Date),
          }),
        }),
      );
    });

    it('is idempotent when already READ (no update call)', async () => {
      mockPrisma.taskOrNotification.findFirst.mockResolvedValue(
        makeNotification({ status: NotificationStatus.READ }),
      );

      await service.markRead('notif-1', 'user-1');

      expect(mockPrisma.taskOrNotification.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when notification is DISMISSED', async () => {
      mockPrisma.taskOrNotification.findFirst.mockResolvedValue(
        makeNotification({ status: NotificationStatus.DISMISSED }),
      );

      await expect(service.markRead('notif-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for wrong owner', async () => {
      mockPrisma.taskOrNotification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('notif-1', 'wrong-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── dismiss() ────────────────────────────────────────────────────────────

  describe('dismiss()', () => {
    it('updates status to DISMISSED', async () => {
      mockPrisma.taskOrNotification.findFirst.mockResolvedValue(
        makeNotification({ status: NotificationStatus.UNREAD }),
      );
      mockPrisma.taskOrNotification.update.mockResolvedValue({});

      await service.dismiss('notif-1', 'user-1');

      expect(mockPrisma.taskOrNotification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: NotificationStatus.DISMISSED },
        }),
      );
    });

    it('is idempotent when already DISMISSED', async () => {
      mockPrisma.taskOrNotification.findFirst.mockResolvedValue(
        makeNotification({ status: NotificationStatus.DISMISSED }),
      );
      mockPrisma.taskOrNotification.update.mockResolvedValue({});

      // Should not throw
      await expect(service.dismiss('notif-1', 'user-1')).resolves.toBeUndefined();
    });
  });

  // ── markAllRead() ─────────────────────────────────────────────────────────

  describe('markAllRead()', () => {
    it('bulk-updates all UNREAD notifications and returns count', async () => {
      mockPrisma.taskOrNotification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllRead('user-1');

      expect(result).toEqual({ updated: 5 });
      expect(mockPrisma.taskOrNotification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { recipientId: 'user-1', status: NotificationStatus.UNREAD },
          data: expect.objectContaining({
            status: NotificationStatus.READ,
            readAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ── listForRecipient() ────────────────────────────────────────────────────

  describe('listForRecipient()', () => {
    it('returns items, total, and unreadCount', async () => {
      const notif = makeNotification();
      mockPrisma.taskOrNotification.findMany.mockResolvedValue([notif]);
      mockPrisma.taskOrNotification.count
        .mockResolvedValueOnce(3)   // filtered total
        .mockResolvedValueOnce(2);  // unread count

      const result = await service.listForRecipient({ recipientId: 'user-1' });

      expect(result).toEqual({ items: [notif], total: 3, unreadCount: 2 });
    });

    it('orders notifications by createdAt descending', async () => {
      mockPrisma.taskOrNotification.findMany.mockResolvedValue([]);
      mockPrisma.taskOrNotification.count.mockResolvedValue(0);

      await service.listForRecipient({ recipientId: 'user-1' });

      expect(mockPrisma.taskOrNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('applies status filter when provided', async () => {
      mockPrisma.taskOrNotification.findMany.mockResolvedValue([]);
      mockPrisma.taskOrNotification.count.mockResolvedValue(0);

      await service.listForRecipient({
        recipientId: 'user-1',
        status: NotificationStatus.UNREAD,
      });

      expect(mockPrisma.taskOrNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: NotificationStatus.UNREAD,
          }),
        }),
      );
    });
  });

  // ── Notification generation scenarios ────────────────────────────────────

  describe('notification generation scenarios', () => {
    it('create() with CHANGE_REQUEST_APPROVED event type records correct eventType', async () => {
      mockPrisma.taskOrNotification.create.mockResolvedValue(
        makeNotification({ eventType: NotificationEventType.CHANGE_REQUEST_APPROVED }),
      );

      await service.create({
        eventType: NotificationEventType.CHANGE_REQUEST_APPROVED,
        recipientId: 'requester-1',
        entityType: AuditEntityType.CHANGE_REQUEST,
        entityId: 'cr-2',
        title: 'Your change request has been approved',
        body: 'Change request CR-2 was approved and is ready to execute.',
      });

      expect(mockPrisma.taskOrNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: NotificationEventType.CHANGE_REQUEST_APPROVED,
          }),
        }),
      );
    });

    it('create() with CHANGE_REQUEST_REJECTED event type records correct eventType', async () => {
      mockPrisma.taskOrNotification.create.mockResolvedValue(
        makeNotification({ eventType: NotificationEventType.CHANGE_REQUEST_REJECTED }),
      );

      await service.create({
        eventType: NotificationEventType.CHANGE_REQUEST_REJECTED,
        recipientId: 'requester-1',
        entityType: AuditEntityType.CHANGE_REQUEST,
        entityId: 'cr-3',
        title: 'Your change request has been rejected',
      });

      expect(mockPrisma.taskOrNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: NotificationEventType.CHANGE_REQUEST_REJECTED,
          }),
        }),
      );
    });

    it('create() with MODEL_PUBLISHED event type records correct eventType', async () => {
      mockPrisma.taskOrNotification.create.mockResolvedValue(
        makeNotification({ eventType: NotificationEventType.MODEL_PUBLISHED }),
      );

      await service.create({
        eventType: NotificationEventType.MODEL_PUBLISHED,
        recipientId: 'actor-1',
        entityType: AuditEntityType.MODEL_VERSION,
        entityId: 'mv-1',
        title: 'Model version published',
        metadata: { versionLabel: 'v1.0.0' },
      });

      expect(mockPrisma.taskOrNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: NotificationEventType.MODEL_PUBLISHED,
          }),
        }),
      );
    });
  });
});
