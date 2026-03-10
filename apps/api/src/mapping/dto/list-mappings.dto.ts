import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MappingState } from './create-mapping.dto';

export class ListMappingsDto {
  /** Filter by mapping state. */
  @IsOptional()
  @IsEnum(MappingState)
  state?: MappingState;

  /** Filter by mappingType value (exact match). */
  @IsOptional()
  @IsString()
  mappingType?: string;

  /** Filter by systemId (exact match). */
  @IsOptional()
  @IsString()
  systemId?: string;

  /** Filter by capabilityId (must be a valid UUID). */
  @IsOptional()
  @IsUUID()
  capabilityId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
