import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSnapshotDto {
  /** The release label for this version (e.g. "v1.0.0", "2026-Q1-release"). */
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  versionLabel!: string;

  /** Optional human-readable description for the release. */
  @IsOptional()
  @IsString()
  description?: string;

  /** Optional curator note captured at publish time. */
  @IsOptional()
  @IsString()
  notes?: string;

  /** Optional approver identifier. */
  @IsOptional()
  @IsString()
  approvedBy?: string;

  /**
   * Actor performing the publish action.
   * Defaults to "system" until Phase 9 auth lands.
   */
  @IsOptional()
  @IsString()
  actorId?: string;
}
