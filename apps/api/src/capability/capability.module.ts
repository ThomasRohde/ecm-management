import { Module } from '@nestjs/common';
import { CapabilityImportController } from './capability-import.controller';
import { CapabilityImportService } from './capability-import.service';
import { CapabilityController } from './capability.controller';
import { CapabilityService } from './capability.service';
import { GuardrailController } from './guardrail.controller';
import { NameGuardrailService } from './name-guardrail.service';
import { VersioningModule } from '../versioning/versioning.module';

@Module({
  imports: [VersioningModule],
  controllers: [CapabilityController, CapabilityImportController, GuardrailController],
  providers: [CapabilityService, CapabilityImportService, NameGuardrailService],
  exports: [CapabilityService],
})
export class CapabilityModule {}
