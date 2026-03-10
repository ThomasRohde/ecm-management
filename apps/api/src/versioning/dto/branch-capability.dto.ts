import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

// Mirror the enums from the capability DTO — avoids cross-module coupling.
export enum BranchCapabilityType {
  ABSTRACT = 'ABSTRACT',
  LEAF = 'LEAF',
}

export enum BranchLifecycleStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  DEPRECATED = 'DEPRECATED',
  RETIRED = 'RETIRED',
}

/**
 * DTO for creating a new capability scoped to a what-if branch.
 * A real Capability row is created (to obtain a stable ID and satisfy FK
 * constraints), but the corresponding CapabilityVersion entry is recorded
 * against the branch ModelVersion — not the MAIN DRAFT.
 */
export class BranchCreateCapabilityDto {
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
  @IsEnum(BranchCapabilityType)
  type?: BranchCapabilityType;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsEnum(BranchLifecycleStatus)
  lifecycleStatus?: BranchLifecycleStatus;

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
}

/**
 * DTO for updating a capability within a what-if branch.
 * Only fields present in the request body are applied; fields not included
 * retain their current value.  The Capability table is NOT modified — instead,
 * a CapabilityVersion entry (changeType=UPDATE) is recorded against the branch.
 */
export class BranchUpdateCapabilityDto {
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
  @IsEnum(BranchCapabilityType)
  type?: BranchCapabilityType;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsEnum(BranchLifecycleStatus)
  lifecycleStatus?: BranchLifecycleStatus;

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
  isErroneous?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  erroneousReason?: string;
}
