import {
  IsEnum,
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  MinLength,
  ArrayNotEmpty,
  IsObject,
} from 'class-validator';
import { ChangeRequestType } from '@prisma/client';

export class CreateChangeRequestDto {
  @IsEnum(ChangeRequestType)
  type!: ChangeRequestType;

  @IsString()
  @MinLength(1)
  rationale!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  affectedCapabilityIds!: string[];

  /**
   * Operation-specific parameters.  Required for some types:
   *   REPARENT: { newParentId?: string | null }
   *   MERGE:    { survivorCapabilityId: string }
   *   RETIRE:   { effectiveTo?: string }  (ISO-8601 date)
   * PROMOTE, DEMOTE, DELETE: omit or pass {}
   */
  @IsOptional()
  @IsObject()
  operationPayload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MinLength(1)
  downstreamPlan?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  impactSummary?: string;
}
