import {
  Body,
  Controller,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BranchType } from '@prisma/client';
import type { AuthTokenPayload } from '../auth/auth.types';
import { AuthenticatedUserGuard } from '../auth/authenticated-user.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { releaseManagementRoles } from '../auth/user-role.utils';
import { ModelVersionService } from './model-version.service';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';
import { RollbackVersionDto } from './dto/rollback-version.dto';

/**
 * VersioningController
 *
 * Endpoints:
 *   GET  /model-versions               – list MAIN branch versions
 *   GET  /model-versions/current-draft – get current DRAFT (or 404)
 *   GET  /model-versions/diff          – diff two versions (?from=&to=)
 *   GET  /model-versions/:id           – get specific version
 *   POST /model-versions/publish       – publish current DRAFT as a named release
 *   POST /model-versions/rollback      – create new DRAFT from a prior published version
 */
@Controller('model-versions')
export class VersioningController {
  constructor(private readonly modelVersionService: ModelVersionService) {}

  @Get()
  async listVersions(@Query('branchType') branchType?: string) {
    const branch =
      branchType === BranchType.WHAT_IF ? BranchType.WHAT_IF : BranchType.MAIN;
    return this.modelVersionService.listVersions(branch);
  }

  @Get('current-draft')
  async getCurrentDraft() {
    const draft = await this.modelVersionService.getCurrentDraft();
    return draft ?? { message: 'No active draft' };
  }

  /**
   * Diff endpoint: GET /model-versions/diff?from=<id>&to=<id>
   *
   * NOTE: This route must be declared BEFORE /:id to prevent Express from
   * matching "diff" as a UUID param.
   */
  @Get('diff')
  async diff(
    @Query('from', ParseUUIDPipe) fromVersionId: string,
    @Query('to', ParseUUIDPipe) toVersionId: string,
  ) {
    return this.modelVersionService.computeDiff(fromVersionId, toVersionId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.modelVersionService.findById(id);
  }

  @Post('publish')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...releaseManagementRoles)
  async publish(@Body() dto: CreateSnapshotDto, @CurrentUser() user: AuthTokenPayload) {
    return this.modelVersionService.publishSnapshot({
      versionLabel: dto.versionLabel,
      description: dto.description,
      notes: dto.notes,
      approvedBy: dto.approvedBy?.trim() || user.sub,
      actorId: user.sub,
    });
  }

  @Post('rollback')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...releaseManagementRoles)
  async rollback(@Body() dto: RollbackVersionDto, @CurrentUser() user: AuthTokenPayload) {
    return this.modelVersionService.rollback({
      rollbackOfVersionId: dto.rollbackOfVersionId,
      createdBy: user.sub,
      notes: dto.notes,
    });
  }
}
