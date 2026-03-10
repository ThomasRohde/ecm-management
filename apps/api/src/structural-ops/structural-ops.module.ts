import { forwardRef, Module } from '@nestjs/common';
import { StructuralOpsService } from './structural-ops.service';
import { DomainEventBus } from './events/capability-domain-events';
import { VersioningModule } from '../versioning/versioning.module';

/**
 * StructuralOpsModule
 *
 * Provides the StructuralOpsService and DomainEventBus.
 * Imported by ChangeRequestModule to wire execution into the CR lifecycle.
 *
 * PrismaService is not listed here because PrismaModule is @Global() and
 * injects PrismaService everywhere automatically.
 */
@Module({
  imports: [forwardRef(() => VersioningModule)],
  providers: [StructuralOpsService, DomainEventBus],
  exports: [StructuralOpsService, DomainEventBus],
})
export class StructuralOpsModule {}
