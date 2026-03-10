import {
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ArrayNotEmpty,
} from 'class-validator';
import { ChangeRequestType } from '@prisma/client';

/**
 * Body for the standalone POST /impact-analysis endpoint.
 *
 * operationType is optional: when supplied it is used to compute severity
 * (RETIRE and MERGE with active mappings → HIGH; others → MEDIUM).
 */
export class QueryImpactDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  capabilityIds!: string[];

  @IsOptional()
  @IsEnum(ChangeRequestType)
  operationType?: ChangeRequestType;
}
