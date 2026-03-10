import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export enum CapabilityImportFormat {
  CSV = 'CSV',
}

export class ImportCapabilitiesDto {
  @IsEnum(CapabilityImportFormat)
  format!: CapabilityImportFormat;

  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  csvContent!: string;
}
