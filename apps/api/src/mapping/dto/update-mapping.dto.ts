import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MappingState } from './create-mapping.dto';

export class UpdateMappingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  mappingType?: string;

  @IsOptional()
  @IsEnum(MappingState)
  state?: MappingState;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}
