import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListDownstreamConsumerEventsDto {
  @IsOptional()
  @IsUUID()
  consumerId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
