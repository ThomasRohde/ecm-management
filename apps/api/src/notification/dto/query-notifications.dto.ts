import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationEventType, NotificationStatus } from '@prisma/client';

export class QueryNotificationsDto {
  /** ID of the recipient – until Phase 9A auth lands this is passed explicitly. */
  @IsString()
  recipientId!: string;

  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @IsOptional()
  @IsEnum(NotificationEventType)
  eventType?: NotificationEventType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}
