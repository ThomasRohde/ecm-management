import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUserGuard } from '../auth/authenticated-user.guard';
import { AnalyticsService } from './analytics.service';
import type { AnalyticsResponse } from './analytics.types';
import { GetGapAnalysisDto } from './dto/get-gap-analysis.dto';
import { GetRecentActivityDto } from './dto/get-recent-activity.dto';

/**
 * Read-only analytics endpoints that drive the Phase 12 dashboard surfaces.
 */
@Controller('analytics')
@UseGuards(AuthenticatedUserGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Return a high-level model-health summary for the main capability model.
   *
   * @returns Totals and breakdowns for capability health, stewardship, and mapping coverage.
   */
  @Get('model-health')
  async getModelHealth() {
    return this.createResponse(await this.analyticsService.getModelHealthSummary());
  }

  /**
   * Return stewardship coverage metrics across the main capability model.
   *
   * @returns Overall and per-domain stewardship coverage plus a top-stewards leaderboard.
   */
  @Get('stewardship-coverage')
  async getStewardshipCoverage() {
    return this.createResponse(await this.analyticsService.getStewardshipCoverage());
  }

  /**
   * Return mapping coverage metrics for leaf capabilities and mappings.
   *
   * @returns Overall coverage, active coverage, state/type distributions, and domain breakdowns.
   */
  @Get('mapping-coverage')
  async getMappingCoverage() {
    return this.createResponse(await this.analyticsService.getMappingCoverage());
  }

  /**
   * Return heatmap cells grouped by domain and lifecycle status.
   *
   * @returns Heatmap cells for observed domains across all lifecycle statuses.
   */
  @Get('heatmap')
  async getHeatmap() {
    return this.createResponse(await this.analyticsService.getHeatmap());
  }

  /**
   * Run the gap-analysis queries for unmapped active leaves and deprecated mapped capabilities.
   *
   * @param query Optional domain and per-list limit filters.
   * @returns Gap-analysis result sets suitable for analytics dashboards.
   */
  @Get('gap-analysis')
  async getGapAnalysis(@Query() query: GetGapAnalysisDto) {
    return this.createResponse(await this.analyticsService.getGapAnalysis(query));
  }

  /**
   * Return recent model activity from the generic audit trail.
   *
   * @param query Optional limit for how many items to return.
   * @returns Newest-first audit activity summaries.
   */
  @Get('recent-activity')
  async getRecentActivity(@Query() query: GetRecentActivityDto) {
    return this.createResponse(await this.analyticsService.getRecentActivity(query));
  }

  private createResponse<T>(data: T): AnalyticsResponse<T> {
    return {
      data,
      meta: {
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
