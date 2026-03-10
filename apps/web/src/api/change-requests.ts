import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApprovalDecision,
  ChangeRequest,
  ChangeRequestAuditEntry,
  CreateChangeRequestInput,
} from '@ecm/shared';
import { ChangeRequestStatus, ChangeRequestType } from '@ecm/shared';
import { apiClient } from './client';
import { getIdentityHeaders } from './identity';

const CHANGE_REQUESTS_KEY = ['change-requests'] as const;
const CAPABILITIES_KEY = ['capabilities'] as const;

function changeRequestKey(id: string) {
  return [...CHANGE_REQUESTS_KEY, 'detail', id] as const;
}

// ─── Extended shape returned by the API ───────────────────────────────────────

export interface ChangeRequestDetail extends ChangeRequest {
  approvalDecisions: ApprovalDecision[];
  auditEntries: ChangeRequestAuditEntry[];
}

export interface ChangeRequestDetailListResponse {
  items: ChangeRequestDetail[];
  total: number;
}

// ─── Query params ─────────────────────────────────────────────────────────────

export interface ChangeRequestQueryParams {
  status?: ChangeRequestStatus;
  type?: ChangeRequestType;
  requestedBy?: string;
}

function buildChangeRequestsPath(params?: ChangeRequestQueryParams): string {
  const searchParams = new URLSearchParams();

  if (params?.status) searchParams.set('status', params.status);
  if (params?.type) searchParams.set('type', params.type);
  if (params?.requestedBy) searchParams.set('requestedBy', params.requestedBy);

  const search = searchParams.toString();
  return search ? `/change-requests?${search}` : '/change-requests';
}

function changeRequestListKey(params?: ChangeRequestQueryParams) {
  const hasParams =
    params &&
    (params.status !== undefined ||
      params.type !== undefined ||
      params.requestedBy !== undefined);

  if (!hasParams) return [...CHANGE_REQUESTS_KEY, 'list'] as const;

  const paramEntries: Record<string, string> = {};
  if (params.status) paramEntries.status = params.status;
  if (params.type) paramEntries.type = params.type;
  if (params.requestedBy) paramEntries.requestedBy = params.requestedBy;

  return [...CHANGE_REQUESTS_KEY, 'list', paramEntries] as const;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useChangeRequests(params?: ChangeRequestQueryParams) {
  return useQuery<ChangeRequestDetailListResponse, Error>({
    queryKey: changeRequestListKey(params),
    queryFn: () =>
      apiClient.get<ChangeRequestDetailListResponse>(
        buildChangeRequestsPath(params),
      ),
  });
}

export function useChangeRequest(id?: string) {
  return useQuery<ChangeRequestDetail, Error>({
    queryKey: changeRequestKey(id ?? 'unknown'),
    queryFn: () =>
      apiClient.get<ChangeRequestDetail>(`/change-requests/${id}`),
    enabled: !!id,
  });
}

export function useCapabilityChangeRequests(capabilityId?: string) {
  return useQuery<ChangeRequestDetailListResponse, Error>({
    queryKey: [
      ...CHANGE_REQUESTS_KEY,
      'by-capability',
      capabilityId ?? 'unknown',
    ],
    queryFn: () =>
      apiClient.get<ChangeRequestDetailListResponse>(
        `/capabilities/${capabilityId}/change-requests`,
      ),
    enabled: !!capabilityId,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation<ChangeRequestDetail, Error, CreateChangeRequestInput>({
    mutationFn: (input) =>
      apiClient.post<ChangeRequestDetail>(
        '/change-requests',
        input,
        getIdentityHeaders(),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHANGE_REQUESTS_KEY });
    },
  });
}

export function useSubmitChangeRequest(id: string) {
  const queryClient = useQueryClient();

  return useMutation<ChangeRequestDetail, Error, void>({
    mutationFn: () =>
      apiClient.post<ChangeRequestDetail>(
        `/change-requests/${id}/submit`,
        {},
        getIdentityHeaders(),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(changeRequestKey(id), data);
      void queryClient.invalidateQueries({ queryKey: CHANGE_REQUESTS_KEY });
    },
  });
}

export function useRequestApproval(id: string) {
  const queryClient = useQueryClient();

  return useMutation<ChangeRequestDetail, Error, void>({
    mutationFn: () =>
      apiClient.post<ChangeRequestDetail>(
        `/change-requests/${id}/request-approval`,
        {},
        getIdentityHeaders(),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(changeRequestKey(id), data);
      void queryClient.invalidateQueries({ queryKey: CHANGE_REQUESTS_KEY });
    },
  });
}

export interface SubmitDecisionInput {
  decision: 'APPROVED' | 'REJECTED';
  comment?: string;
}

export function useSubmitDecision(id: string) {
  const queryClient = useQueryClient();

  return useMutation<ChangeRequestDetail, Error, SubmitDecisionInput>({
    mutationFn: (input) =>
      apiClient.post<ChangeRequestDetail>(
        `/change-requests/${id}/decisions`,
        input,
        getIdentityHeaders(),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(changeRequestKey(id), data);
      void queryClient.invalidateQueries({ queryKey: CHANGE_REQUESTS_KEY });
    },
  });
}

export function useExecuteChangeRequest(id: string) {
  const queryClient = useQueryClient();

  return useMutation<ChangeRequestDetail, Error, void>({
    mutationFn: () =>
      apiClient.post<ChangeRequestDetail>(
        `/change-requests/${id}/execute`,
        {},
        getIdentityHeaders(),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(changeRequestKey(id), data);
      void queryClient.invalidateQueries({ queryKey: CHANGE_REQUESTS_KEY });
    },
  });
}

export function useCompleteChangeRequest(id: string) {
  const queryClient = useQueryClient();

  return useMutation<ChangeRequestDetail, Error, void>({
    mutationFn: () =>
      apiClient.post<ChangeRequestDetail>(
        `/change-requests/${id}/complete`,
        {},
        getIdentityHeaders(),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(changeRequestKey(id), data);
      void queryClient.invalidateQueries({ queryKey: CHANGE_REQUESTS_KEY });
      void queryClient.invalidateQueries({ queryKey: CAPABILITIES_KEY });
    },
  });
}

export function useApplyStructuralOperation(id: string) {
  const queryClient = useQueryClient();

  return useMutation<ChangeRequestDetail, Error, void>({
    mutationFn: () =>
      apiClient.post<ChangeRequestDetail>(
        `/change-requests/${id}/apply`,
        {},
        getIdentityHeaders(),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(changeRequestKey(id), data);
      void queryClient.invalidateQueries({ queryKey: CHANGE_REQUESTS_KEY });
      void queryClient.invalidateQueries({ queryKey: CAPABILITIES_KEY });
    },
  });
}

export function useFailChangeRequest(id: string) {
  const queryClient = useQueryClient();

  return useMutation<ChangeRequestDetail, Error, { comment?: string }>({
    mutationFn: (input) =>
      apiClient.post<ChangeRequestDetail>(
        `/change-requests/${id}/fail`,
        input,
        getIdentityHeaders(),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(changeRequestKey(id), data);
      void queryClient.invalidateQueries({ queryKey: CHANGE_REQUESTS_KEY });
    },
  });
}

export function useCancelChangeRequest(id: string) {
  const queryClient = useQueryClient();

  return useMutation<ChangeRequestDetail, Error, { comment?: string }>({
    mutationFn: (input) =>
      apiClient.post<ChangeRequestDetail>(
        `/change-requests/${id}/cancel`,
        input,
        getIdentityHeaders(),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(changeRequestKey(id), data);
      void queryClient.invalidateQueries({ queryKey: CHANGE_REQUESTS_KEY });
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Statuses that represent an in-flight (not terminal) change request. */
export const ACTIVE_CHANGE_REQUEST_STATUSES = new Set<ChangeRequestStatus>([
  ChangeRequestStatus.DRAFT,
  ChangeRequestStatus.SUBMITTED,
  ChangeRequestStatus.PENDING_APPROVAL,
  ChangeRequestStatus.APPROVED,
  ChangeRequestStatus.EXECUTING,
]);

/**
 * Builds a lookup map from capability ID to the number of active (non-terminal)
 * change requests that reference it. Suitable for passing to list/card surfaces.
 */
export function buildActiveChangeRequestCountById(
  items: ChangeRequest[],
): Map<string, number> {
  const result = new Map<string, number>();

  for (const cr of items) {
    if (!ACTIVE_CHANGE_REQUEST_STATUSES.has(cr.status)) continue;
    for (const capId of cr.affectedCapabilityIds) {
      result.set(capId, (result.get(capId) ?? 0) + 1);
    }
  }

  return result;
}

export { ChangeRequestStatus, ChangeRequestType };
