/**
 * Web API layer for impact analysis.
 *
 * Wraps the two backend endpoints:
 *  - POST /impact-analysis  (standalone, accepts capabilityIds + optional operationType)
 *  - GET  /change-requests/:id/impact
 *
 * Both return the shared ImpactAnalysisResult contract from @ecm/shared.
 */

import { useQuery } from '@tanstack/react-query';
import type { ImpactAnalysisInput, ImpactAnalysisResult } from '@ecm/shared';
import { ChangeRequestType } from '@ecm/shared';
import { apiClient } from './client';
import { getIdentityHeaders } from './identity';

// ─── Query key roots ──────────────────────────────────────────────────────────

const IMPACT_ANALYSIS_KEY = ['impact-analysis'] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** CR types for which impact analysis is most relevant (RETIRE / MERGE). */
export const HIGH_IMPACT_CR_TYPES = new Set<ChangeRequestType>([
  ChangeRequestType.RETIRE,
  ChangeRequestType.MERGE,
]);

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Standalone impact analysis.
 *
 * Pass `null` (or an empty capabilityIds array) to suppress the request.
 * Suitable for the CR creation form's live preview.
 */
export function useImpactAnalysis(
  input: ImpactAnalysisInput | null,
  enabled = true,
) {
  const hasCapabilities = (input?.capabilityIds.length ?? 0) > 0;

  return useQuery<ImpactAnalysisResult, Error>({
    queryKey: [
      ...IMPACT_ANALYSIS_KEY,
      'standalone',
      input?.capabilityIds.slice().sort().join(',') ?? '',
      input?.operationType ?? '',
    ] as const,
    queryFn: () =>
      apiClient.post<ImpactAnalysisResult>(
        '/impact-analysis',
        {
          capabilityIds: input!.capabilityIds,
          operationType: input!.operationType,
        },
        getIdentityHeaders(),
      ),
    enabled: enabled && hasCapabilities,
    // Keep the previous result visible while capability selection is being
    // refined so the UI does not flash an empty state on each change.
    placeholderData: (prev) => prev,
  });
}

/**
 * Impact analysis for a specific change request.
 *
 * Calls GET /change-requests/:id/impact which the backend computes lazily
 * from the CR's affectedCapabilityIds and type.
 */
export function useChangeRequestImpact(changeRequestId?: string) {
  return useQuery<ImpactAnalysisResult, Error>({
    queryKey: [
      ...IMPACT_ANALYSIS_KEY,
      'change-request',
      changeRequestId ?? 'unknown',
    ] as const,
    queryFn: () =>
      apiClient.get<ImpactAnalysisResult>(
        `/change-requests/${changeRequestId}/impact`,
        getIdentityHeaders(),
      ),
    enabled: !!changeRequestId,
  });
}
