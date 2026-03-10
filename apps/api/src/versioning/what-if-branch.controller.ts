/**
 * WhatIfBranchController
 *
 * REST surface for what-if branches and the capability CRUD scoped to them.
 *
 * Route prefix: /what-if-branches
 *
 * Branch management:
 *   POST   /what-if-branches                                   create branch   [curator only]
 *   GET    /what-if-branches                                   list branches
 *   GET    /what-if-branches/:branchId                         get branch
 *   DELETE /what-if-branches/:branchId                         discard branch  [curator only]
 *   GET    /what-if-branches/:branchId/diff                    diff vs base
 *
 * Capability operations (branch-scoped):
 *   GET    /what-if-branches/:branchId/capabilities            list capabilities in branch
 *   POST   /what-if-branches/:branchId/capabilities            create capability in branch  [curator only]
 *   GET    /what-if-branches/:branchId/capabilities/:capId     get capability projection
 *   PATCH  /what-if-branches/:branchId/capabilities/:capId     update capability in branch  [curator only]
 *   DELETE /what-if-branches/:branchId/capabilities/:capId     delete capability in branch  [curator only]
 *
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.types';
import { AuthenticatedUserGuard } from '../auth/authenticated-user.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { capabilityManagementRoles } from '../auth/user-role.utils';
import { WhatIfBranchService } from './what-if-branch.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import {
  BranchCreateCapabilityDto,
  BranchUpdateCapabilityDto,
} from './dto/branch-capability.dto';

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('what-if-branches')
export class WhatIfBranchController {
  constructor(private readonly whatIfBranchService: WhatIfBranchService) {}

  // ── Branch management ─────────────────────────────────────────────────────

  /**
   * POST /what-if-branches
   * Create a new what-if branch forked from the current MAIN DRAFT.
   * Restricted to curators.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...capabilityManagementRoles)
  async createBranch(
    @Body() dto: CreateBranchDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.whatIfBranchService.createBranch(dto, user.sub);
  }

  /**
   * GET /what-if-branches
   * List all what-if branches (any role).
   */
  @Get()
  async listBranches() {
    return this.whatIfBranchService.listBranches();
  }

  /**
   * GET /what-if-branches/:branchId/diff
   * Diff the branch against its base version.
   * NOTE: Must be declared BEFORE /:branchId to prevent Express matching "diff".
   */
  @Get(':branchId/diff')
  async diffVsBase(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.whatIfBranchService.diffVsBase(branchId);
  }

  /**
   * GET /what-if-branches/:branchId
   * Get a specific what-if branch.
   */
  @Get(':branchId')
  async getBranch(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.whatIfBranchService.getBranch(branchId);
  }

  /**
   * DELETE /what-if-branches/:branchId
   * Discard (retire) a what-if branch.  Non-destructive: soft-deletes via
   * state → ROLLED_BACK.  Restricted to curators.
   */
  @Delete(':branchId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...capabilityManagementRoles)
  async discardBranch(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.whatIfBranchService.discardBranch(branchId);
  }

  // ── Capability operations (branch-scoped) ─────────────────────────────────

  /**
   * GET /what-if-branches/:branchId/capabilities
   * List capabilities projected at the branch state.
   */
  @Get(':branchId/capabilities')
  async listCapabilities(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.whatIfBranchService.listCapabilitiesInBranch(branchId);
  }

  /**
   * POST /what-if-branches/:branchId/capabilities
   * Create a new capability scoped to the branch.  Restricted to curators.
   */
  @Post(':branchId/capabilities')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...capabilityManagementRoles)
  async createCapability(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: BranchCreateCapabilityDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.whatIfBranchService.createCapabilityInBranch(branchId, dto, user.sub);
  }

  /**
   * GET /what-if-branches/:branchId/capabilities/:capId
   * Get a capability projected at the branch state.
   */
  @Get(':branchId/capabilities/:capId')
  async getCapability(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('capId', ParseUUIDPipe) capId: string,
  ) {
    return this.whatIfBranchService.getCapabilityInBranch(branchId, capId);
  }

  /**
   * PATCH /what-if-branches/:branchId/capabilities/:capId
   * Update a capability within the branch.  Restricted to curators.
   */
  @Patch(':branchId/capabilities/:capId')
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...capabilityManagementRoles)
  async updateCapability(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('capId', ParseUUIDPipe) capId: string,
    @Body() dto: BranchUpdateCapabilityDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.whatIfBranchService.updateCapabilityInBranch(branchId, capId, dto, user.sub);
  }

  /**
   * DELETE /what-if-branches/:branchId/capabilities/:capId
   * Delete (mark as removed within branch) a capability.  Restricted to curators.
   */
  @Delete(':branchId/capabilities/:capId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...capabilityManagementRoles)
  async deleteCapability(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('capId', ParseUUIDPipe) capId: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    await this.whatIfBranchService.deleteCapabilityInBranch(branchId, capId, user.sub);
  }
}
