import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CapabilityImportCommitResult,
  CapabilityImportDryRunResult,
  CapabilityImportRequest,
} from '@ecm/shared';
import { apiClient } from './client';
import { getIdentityHeaders } from './identity';

export const CAPABILITY_IMPORT_KEY = ['capability-import'] as const;
export const CAPABILITY_IMPORT_MAX_CONTENT_LENGTH = 200_000;

export function buildCapabilityImportPath(action: 'dry-run' | 'commit'): string {
  return `/capability-imports/${action}`;
}

export function useDryRunCapabilityImport() {
  return useMutation<CapabilityImportDryRunResult, Error, CapabilityImportRequest>({
    mutationFn: (input) =>
      apiClient.post<CapabilityImportDryRunResult>(
        buildCapabilityImportPath('dry-run'),
        input,
        getIdentityHeaders(),
      ),
  });
}

export function useCommitCapabilityImport() {
  const queryClient = useQueryClient();

  return useMutation<CapabilityImportCommitResult, Error, CapabilityImportRequest>({
    mutationFn: (input) =>
      apiClient.post<CapabilityImportCommitResult>(
        buildCapabilityImportPath('commit'),
        input,
        getIdentityHeaders(),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['capabilities'] });
      void queryClient.invalidateQueries({ queryKey: ['guardrails'] });
    },
  });
}
