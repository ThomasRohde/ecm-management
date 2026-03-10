import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUserGuard } from '../auth/authenticated-user.guard';
import { ImpactAnalysisService } from './impact-analysis.service';
import { QueryImpactDto } from './dto/query-impact.dto';

/**
 * Standalone impact analysis endpoint.
 *
 * POST /api/v1/impact-analysis
 *
 * Accepts a list of capability IDs and an optional operation type, and
 * returns the computed impact analysis result (affected mappings, systems, and
 * severity summary) without modifying any data.
 *
 * This endpoint is intentionally separate from the change-request lifecycle so
 * that frontend surfaces can show impact data before a change request has been
 * created (e.g. while filling in a "create merge request" form).
 */
@Controller('impact-analysis')
export class ImpactAnalysisController {
  constructor(private readonly impactAnalysisService: ImpactAnalysisService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedUserGuard)
  async analyse(@Body() dto: QueryImpactDto) {
    return this.impactAnalysisService.analyse(dto.capabilityIds, dto.operationType);
  }
}
