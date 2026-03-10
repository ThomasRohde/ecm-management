import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
  IsDateString,
  IsBoolean,
  MinLength,
  MaxLength,
} from 'class-validator';

export enum CapabilityType {
  ABSTRACT = 'ABSTRACT',
  LEAF = 'LEAF',
}

export enum LifecycleStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  DEPRECATED = 'DEPRECATED',
  RETIRED = 'RETIRED',
}

export class CreateCapabilityDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  uniqueName!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsEnum(CapabilityType)
  type?: CapabilityType;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsEnum(LifecycleStatus)
  lifecycleStatus?: LifecycleStatus;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsString()
  rationale?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceReferences?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  stewardId?: string;

  @IsOptional()
  @IsString()
  stewardDepartment?: string;

  @IsOptional()
  @IsBoolean()
  nameGuardrailOverride?: boolean;

  @IsOptional()
  @IsString()
  nameGuardrailOverrideRationale?: string;
}
