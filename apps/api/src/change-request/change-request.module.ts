import { Module } from '@nestjs/common';
import { ChangeRequestController, CapabilityChangeRequestController } from './change-request.controller';
import { ChangeRequestService } from './change-request.service';
import { StructuralOpsModule } from '../structural-ops/structural-ops.module';
import { ImpactAnalysisModule } from '../impact-analysis/impact-analysis.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [StructuralOpsModule, ImpactAnalysisModule, AuditModule, NotificationModule],
  controllers: [ChangeRequestController, CapabilityChangeRequestController],
  providers: [ChangeRequestService],
  exports: [ChangeRequestService],
})
export class ChangeRequestModule {}
