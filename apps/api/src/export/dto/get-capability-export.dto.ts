import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { CapabilityType, LifecycleStatus } from '../../capability/dto/create-capability.dto';
import type { CapabilityExportQuery } from '../export.types';

function normalizeStringArray(value: unknown): string[] | undefined {
  const values = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : typeof value === 'string'
      ? [value]
      : [];
  const normalized = values
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

export class GetCapabilityExportDto implements CapabilityExportQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsEnum(LifecycleStatus)
  lifecycleStatus?: LifecycleStatus;

  @IsOptional()
  @IsEnum(CapabilityType)
  type?: CapabilityType;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
