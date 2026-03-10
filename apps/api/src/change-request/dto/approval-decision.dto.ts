import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApprovalDecisionOutcome } from '@prisma/client';

export class ApprovalDecisionDto {
  @IsEnum(ApprovalDecisionOutcome)
  decision!: ApprovalDecisionOutcome;

  @IsOptional()
  @IsString()
  comment?: string;
}
