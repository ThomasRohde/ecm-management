import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
  IsDateString,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { CapabilityType, LifecycleStatus } from './create-capability.dto';

export class UpdateCapabilityDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  uniqueName?: string;

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

  @IsOptional()
  @IsBoolean()
  isErroneous?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  erroneousReason?: string;
}
