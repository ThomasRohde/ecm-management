import { IsOptional, IsString, IsUUID } from 'class-validator';

export class RollbackVersionDto {
  /** ID of the PUBLISHED (or ROLLED_BACK) ModelVersion to revert to. */
  @IsUUID()
  rollbackOfVersionId!: string;

  /**
   * Actor initiating the rollback.
   * Defaults to "system" until Phase 9 auth lands.
   */
  @IsOptional()
  @IsString()
  createdBy?: string;

  /** Optional note explaining why the rollback is being performed. */
  @IsOptional()
  @IsString()
  notes?: string;
}
