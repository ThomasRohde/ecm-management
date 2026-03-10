import { HealthStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateDownstreamConsumerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  contractType?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  syncMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  transformationProfile?: string | null;

  @IsOptional()
  @IsEnum(HealthStatus)
  healthStatus?: HealthStatus;
}
