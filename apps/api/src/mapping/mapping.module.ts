import { Module } from '@nestjs/common';
import { MappingService } from './mapping.service';
import { MappingController, CapabilityMappingController } from './mapping.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [MappingController, CapabilityMappingController],
  providers: [MappingService],
  exports: [MappingService],
})
export class MappingModule {}
