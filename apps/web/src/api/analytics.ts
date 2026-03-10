/**
 * Phase 12 Analytics API – React Query hooks for the analytics reporting
 * endpoints protected by AuthenticatedUserGuard.
 *
 * All hooks accept an `enabled` parameter so callers can gate queries on auth
 * state without conditionally calling hooks.
 */

import { useQuery } from '@tanstack/react-query';
import type {
  AnalyticsHeatmapCell,
  AnalyticsResponse,
  GapAnalysisResult,
  MappingCoverageReport,
  ModelHealthSummary,
  RecentActivityReport,
  StewardshipCoverageReport,
} from '@ecm/shared';
import { apiClient } from './client';
import { getIdentityHeaders } from './identity';

// ─── Cache key registry ───────────────────────────────────────────────────────

export const ANALYTICS_KEYS = {
  modelHealth: ['analytics', 'model-health'] as const,
  stewardshipCoverage: ['analytics', 'stewardship-coverage'] as const,
  mappingCoverage: ['analytics', 'mapping-coverage'] as const,
  heatmap: ['analytics', 'heatmap'] as const,
  // Normalize empty strings to null so the cache key stays aligned with the
  // URL that buildGapAnalysisPath() produces (which also drops empty strings).
  gapAnalysis: (domain?: string, limit?: number) =>
    ['analytics', 'gap-analysis', domain || null, limit ?? null] as const,
  recentActivity: (limit?: number) =>
    ['analytics', 'recent-activity', limit ?? null] as const,
} as const;

// ─── Path builders (exported so they can be unit-tested) ─────────────────────

export function buildGapAnalysisPath(domain?: string, limit?: number): string {
  const params = new URLSearchParams();
  if (domain !== undefined && domain !== '') params.set('domain', domain);
  if (limit !== undefined) params.set('limit', String(limit));
  const qs = params.toString();
  return `/analytics/gap-analysis${qs ? `?${qs}` : ''}`;
}

export function buildRecentActivityPath(limit?: number): string {
  return limit !== undefined
    ? `/analytics/recent-activity?limit=${limit}`
    : '/analytics/recent-activity';
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useModelHealth(enabled = true) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.modelHealth,
    queryFn: () =>
      apiClient.get<AnalyticsResponse<ModelHealthSummary>>(
        '/analytics/model-health',
        getIdentityHeaders(),
      ),
    enabled,
  });
}

export function useStewardshipCoverage(enabled = true) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.stewardshipCoverage,
    queryFn: () =>
      apiClient.get<AnalyticsResponse<StewardshipCoverageReport>>(
        '/analytics/stewardship-coverage',
        getIdentityHeaders(),
      ),
    enabled,
  });
}

export function useMappingCoverage(enabled = true) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.mappingCoverage,
    queryFn: () =>
      apiClient.get<AnalyticsResponse<MappingCoverageReport>>(
        '/analytics/mapping-coverage',
        getIdentityHeaders(),
      ),
    enabled,
  });
}

export function useAnalyticsHeatmap(enabled = true) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.heatmap,
    queryFn: () =>
      apiClient.get<AnalyticsResponse<AnalyticsHeatmapCell[]>>(
        '/analytics/heatmap',
        getIdentityHeaders(),
      ),
    enabled,
  });
}

export interface GapAnalysisParams {
  domain?: string;
  limit?: number;
}

export function useGapAnalysis(params: GapAnalysisParams = {}, enabled = true) {
  const { domain, limit } = params;
  return useQuery({
    queryKey: ANALYTICS_KEYS.gapAnalysis(domain, limit),
    queryFn: () =>
      apiClient.get<AnalyticsResponse<GapAnalysisResult>>(
        buildGapAnalysisPath(domain, limit),
        getIdentityHeaders(),
      ),
    enabled,
  });
}

export function useRecentActivity(limit?: number, enabled = true) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.recentActivity(limit),
    queryFn: () =>
      apiClient.get<AnalyticsResponse<RecentActivityReport>>(
        buildRecentActivityPath(limit),
        getIdentityHeaders(),
      ),
    enabled,
  });
}
