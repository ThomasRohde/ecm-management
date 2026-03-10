/**
 * NotificationController (Phase 9B)
 *
 * Endpoints:
 *   GET  /notifications                 – list inbox for a recipient
 *   PATCH /notifications/read-all       – bulk mark-all-read  (MUST be before /:id)
 *   PATCH /notifications/:id/read       – mark single notification as read
 *   PATCH /notifications/:id/dismiss    – dismiss single notification
 *
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.types';
import { AuthenticatedUserGuard } from '../auth/authenticated-user.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationService } from './notification.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { RecipientIdDto } from './dto/recipient-id.dto';

@Controller('notifications')
@UseGuards(AuthenticatedUserGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * GET /api/v1/notifications
   *
   * Query params: recipientId (required), status, eventType, limit, offset
   */
  @Get()
  findAll(
    @Query() query: QueryNotificationsDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    this.assertRecipientMatch(query.recipientId, user);
    return this.notificationService.listForRecipient(query);
  }

  /**
   * PATCH /api/v1/notifications/read-all
   *
   * Mark every UNREAD notification for the recipient as READ.
   * Fixed-path route – declared before /:id so NestJS matches it first.
   */
  @Patch('read-all')
  markAllRead(@Body() body: RecipientIdDto, @CurrentUser() user: AuthTokenPayload) {
    this.assertRecipientMatch(body.recipientId, user);
    return this.notificationService.markAllRead(body.recipientId);
  }

  /**
   * PATCH /api/v1/notifications/:id/read
   *
   * Mark a single notification as READ.  Idempotent if already read.
   * Body: { recipientId }
   */
  @Patch(':id/read')
  markRead(
    @Param('id') id: string,
    @Body() body: RecipientIdDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    this.assertRecipientMatch(body.recipientId, user);
    return this.notificationService.markRead(id, body.recipientId);
  }

  /**
   * PATCH /api/v1/notifications/:id/dismiss
   *
   * Dismiss a notification.  Idempotent if already dismissed.
   * Body: { recipientId }
   */
  @Patch(':id/dismiss')
  dismiss(
    @Param('id') id: string,
    @Body() body: RecipientIdDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    this.assertRecipientMatch(body.recipientId, user);
    return this.notificationService.dismiss(id, body.recipientId);
  }

  private assertRecipientMatch(recipientId: string, user: AuthTokenPayload): void {
    if (recipientId !== user.sub) {
      throw new ForbiddenException('Notifications may only be accessed for the current user.');
    }
  }
}
