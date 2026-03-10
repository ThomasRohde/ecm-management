import { Module } from '@nestjs/common';
import { CapabilityModule } from '../capability/capability.module';
import { IntegrationModule } from '../integration/integration.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [CapabilityModule, IntegrationModule],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
