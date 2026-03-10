import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUserGuard } from '../auth/authenticated-user.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';
import { auditViewerRoles } from '../auth/user-role.utils';

/**
 * AuditController
 *
 * Exposes the generic immutable audit trail.
 * Auth guard is left as a TODO for the Phase 9A auth-integration slice.
 */
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /api/v1/audit
   *
   * Query the immutable audit trail with optional filters.
   *
   * Supported query params:
   *   entityType  – filter by audited entity type (CAPABILITY, CHANGE_REQUEST, …)
   *   entityId    – filter by specific entity UUID
   *   actorId     – filter by actor (user ID or "system")
   *   action      – filter by audit action verb (CREATE, UPDATE, …)
   *   fromDate    – ISO timestamp lower bound (inclusive)
   *   toDate      – ISO timestamp upper bound (inclusive)
   *   limit       – page size (default 50, min 1)
   *   offset      – skip rows (default 0)
   *
   * Returns `{ items: AuditEntry[], total: number }`.
   */
  @Get()
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...auditViewerRoles)
  findAll(@Query() query: QueryAuditDto) {
    return this.auditService.query(query);
  }
}
