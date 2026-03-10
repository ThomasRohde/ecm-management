import { forwardRef, Module } from '@nestjs/common';
import { CapabilityVersionService } from './capability-version.service';
import { ModelVersionService } from './model-version.service';
import { VersioningController } from './versioning.controller';
import { WhatIfBranchService } from './what-if-branch.service';
import { WhatIfBranchController } from './what-if-branch.controller';
import { AuditModule } from '../audit/audit.module';
import { IntegrationModule } from '../integration/integration.module';
import { StructuralOpsModule } from '../structural-ops/structural-ops.module';

/**
 * VersioningModule
 *
 * Provides and exports:
 *  - CapabilityVersionService (used by CapabilityModule and StructuralOpsModule
 *    to record per-capability change history)
 *  - ModelVersionService (manages the ModelVersion lifecycle)
 *  - WhatIfBranchService (Phase 6B: what-if branch management)
 *
 * PrismaService is injected automatically because PrismaModule is @Global().
 */
@Module({
  imports: [
    forwardRef(() => AuditModule),
    forwardRef(() => StructuralOpsModule),
    forwardRef(() => IntegrationModule),
  ],
  controllers: [VersioningController, WhatIfBranchController],
  providers: [CapabilityVersionService, ModelVersionService, WhatIfBranchService],
  exports: [CapabilityVersionService, ModelVersionService, WhatIfBranchService],
})
export class VersioningModule {}
