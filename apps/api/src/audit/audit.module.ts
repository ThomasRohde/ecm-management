import { forwardRef, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditEventListenerService } from './audit-event-listener.service';
import { StructuralOpsModule } from '../structural-ops/structural-ops.module';

/**
 * AuditModule (Phase 9B)
 *
 * Provides:
 *  - AuditService         – immutable audit recording + query (consumed by other modules)
 *  - AuditController      – GET /audit endpoint
 *  - AuditEventListenerService – wires AuditService to the domain event bus
 *
 * Imports StructuralOpsModule to get access to DomainEventBus.
 * AuditService is exported so other modules (ChangeRequestModule,
 * VersioningModule, MappingModule) can inject it without re-importing this module.
 */
@Module({
  imports: [forwardRef(() => StructuralOpsModule)],
  controllers: [AuditController],
  providers: [AuditService, AuditEventListenerService],
  exports: [AuditService],
})
export class AuditModule {}
