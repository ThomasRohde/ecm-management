import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO for creating a what-if branch.
 * Branches fork from the current MAIN DRAFT state.
 * Restricted to the `curator` role (enforced at the controller layer via
 * x-user-role header until Phase 9 auth lands).
 */
export class CreateBranchDto {
  /**
   * Human-readable name for this what-if branch (e.g. "restructure-2026-h1").
   * Must be unique among active what-if branches.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  branchName!: string;

  /** Optional description explaining the purpose of this branch. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
