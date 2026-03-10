import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ChangeRequestStatus, ChangeRequestType } from '@prisma/client';

export class ListChangeRequestsDto {
  @IsOptional()
  @IsEnum(ChangeRequestStatus)
  status?: ChangeRequestStatus;

  @IsOptional()
  @IsEnum(ChangeRequestType)
  type?: ChangeRequestType;

  @IsOptional()
  @IsString()
  requestedBy?: string;
}
