import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum MappingState {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
}

export class CreateMappingDto {
  /** Free-form label for the integration style, e.g. "CONSUMES", "PRODUCES". */
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  mappingType!: string;

  /** Opaque identifier for the external system (not a UUID – systems are not yet modelled as entities). */
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  systemId!: string;

  /** The capability this mapping attaches to. */
  @IsUUID()
  capabilityId!: string;

  /** Initial state; defaults to ACTIVE when omitted. */
  @IsOptional()
  @IsEnum(MappingState)
  state?: MappingState;

  /** Arbitrary system-specific metadata. */
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}
