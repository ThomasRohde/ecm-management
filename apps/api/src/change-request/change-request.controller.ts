import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthTokenPayload } from '../auth/auth.types';
import { AuthenticatedUserGuard } from '../auth/authenticated-user.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  changeRequestDecisionRoles,
  changeRequestManagementRoles,
  workflowApprovalRoleFromUserRole,
} from '../auth/user-role.utils';
import { ChangeRequestService } from './change-request.service';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { ApprovalDecisionDto } from './dto/approval-decision.dto';
import { ListChangeRequestsDto } from './dto/list-change-requests.dto';
import { CommentBodyDto } from './dto/comment-body.dto';
import { ImpactAnalysisService } from '../impact-analysis/impact-analysis.service';

@Controller('change-requests')
export class ChangeRequestController {
  constructor(
    private readonly changeRequestService: ChangeRequestService,
    private readonly impactAnalysisService: ImpactAnalysisService,
  ) {}

  // ── List & detail ──────────────────────────────────────────────────────────

  @Get()
  async findAll(@Query() query: ListChangeRequestsDto) {
    return this.changeRequestService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.changeRequestService.findOne(id);
  }

  /**
   * Compute the impact analysis for a specific change request.
   *
   * GET /api/v1/change-requests/:id/impact
   *
   * Returns the full ImpactAnalysisResult for the CR's affectedCapabilityIds
   * and type.  This is a read-only, side-effect-free endpoint safe to call at
   * any point in the CR lifecycle (including DRAFT).
   *
   * Route is declared before :id catch-all patterns to prevent NestJS from
   * trying to parse "impact" as a UUID.
   */
  @Get(':id/impact')
  @UseGuards(AuthenticatedUserGuard)
  async getImpact(@Param('id', ParseUUIDPipe) id: string) {
    // Verify the CR exists first — raises ChangeRequestNotFoundException on miss.
    const cr = await this.changeRequestService.findOne(id);
    return this.impactAnalysisService.analyse(
      cr.affectedCapabilityIds,
      cr.type,
    );
  }


  // ── Create ─────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...changeRequestManagementRoles)
  async create(@Body() dto: CreateChangeRequestDto, @CurrentUser() user: AuthTokenPayload) {
    return this.changeRequestService.create(dto, user.sub);
  }

  // ── Lifecycle transitions ──────────────────────────────────────────────────

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...changeRequestManagementRoles)
  async submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthTokenPayload) {
    return this.changeRequestService.submit(id, user.sub);
  }

  @Post(':id/request-approval')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...changeRequestManagementRoles)
  async requestApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.changeRequestService.requestApproval(id, user.sub);
  }

  @Post(':id/decisions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...changeRequestDecisionRoles)
  async submitDecision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const changeRequest =
      user.role === UserRole.ADMIN
        ? await this.changeRequestService.findOne(id)
        : null;
    const approvalRole =
      user.role === UserRole.ADMIN
        ? this.resolveAdminApprovalRole(changeRequest?.approvalDecisions ?? [])
        : workflowApprovalRoleFromUserRole(user.role);

    if (!approvalRole) {
      throw new ForbiddenException('This role cannot submit approval decisions.');
    }

    return this.changeRequestService.submitDecision(
      id,
      dto,
      user.sub,
      approvalRole,
    );
  }

  private resolveAdminApprovalRole(
    approvalDecisions: Array<{ approverRole: string; decision: string }>,
  ) {
    const curatorDecision = approvalDecisions.find(
      (decision) => decision.approverRole === 'curator',
    );

    if (!curatorDecision) {
      return 'curator' as const;
    }

    const governanceBoardDecision = approvalDecisions.find(
      (decision) => decision.approverRole === 'governance-board',
    );

    if (
      curatorDecision.decision === 'APPROVED' &&
      !governanceBoardDecision
    ) {
      return 'governance-board' as const;
    }

    return null;
  }

  @Post(':id/execute')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...changeRequestManagementRoles)
  async execute(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthTokenPayload) {
    return this.changeRequestService.execute(id, user.sub);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...changeRequestManagementRoles)
  async complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthTokenPayload) {
    return this.changeRequestService.complete(id, user.sub);
  }

  /**
   * Apply a structural operation (REPARENT, PROMOTE, DEMOTE, MERGE, RETIRE,
   * DELETE).  The CR must already be in EXECUTING status (call /execute first).
   *
   * On success the CR is atomically transitioned to COMPLETED and the
   * relevant capability mutations are persisted.  A domain event is emitted
   * after the transaction commits.
   *
   * If the operation fails, the CR remains in EXECUTING status.  Call /fail
   * to roll back to APPROVED for retry.
   */
  @Post(':id/apply')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...changeRequestManagementRoles)
  async applyStructuralOperation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.changeRequestService.applyStructuralOperation(
      id,
      user.sub,
    );
  }

  @Post(':id/fail')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...changeRequestManagementRoles)
  async reportFailure(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CommentBodyDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.changeRequestService.reportFailure(
      id,
      user.sub,
      body.comment,
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...changeRequestManagementRoles)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CommentBodyDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.changeRequestService.cancel(
      id,
      user.sub,
      body.comment,
    );
  }
}

/**
 * Capability-scoped controller — handles routes nested under /capabilities.
 * Registered in ChangeRequestModule to avoid a circular dependency between
 * CapabilityModule and ChangeRequestModule.
 */
@Controller('capabilities')
export class CapabilityChangeRequestController {
  constructor(private readonly changeRequestService: ChangeRequestService) {}

  @Get(':capabilityId/change-requests')
  async findActiveForCapability(
    @Param('capabilityId', ParseUUIDPipe) capabilityId: string,
  ) {
    return this.changeRequestService.findActiveByCapabilityId(capabilityId);
  }
}
