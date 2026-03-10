import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';

/**
 * NotificationModule (Phase 9B)
 *
 * Provides:
 *  - NotificationService  – create / query / state-transition for TaskOrNotification
 *  - NotificationController – REST endpoints for the notification inbox
 *
 * NotificationService is exported so other modules (ChangeRequestModule, etc.)
 * can inject it to generate notifications on workflow events.
 */
@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
