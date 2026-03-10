import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Capability,
  CapabilityStewardship,
  CreateCapabilityInput,
  FlaggedCapabilityListResponse,
  UpdateCapabilityInput,
} from '@ecm/shared';
import type { CapabilityType, LifecycleStatus } from '@ecm/shared';
import { apiClient } from './client';
import { getIdentityHeaders } from './identity';

const CAPABILITIES_KEY = ['capabilities'] as const;
const GUARDRAILS_KEY = ['guardrails'] as const;

export interface CapabilityQueryParams {
  search?: string;
  domain?: string;
  lifecycleStatus?: LifecycleStatus;
  type?: CapabilityType;
  parentId?: string;
  page?: number;
  limit?: number;
}

export interface FlaggedCapabilityQueryParams {
  page?: number;
  limit?: number;
}

export interface CapabilitySummary {
  id: string;
  uniqueName: string;
  description: string | null;
  type: CapabilityType;
  lifecycleStatus: LifecycleStatus;
  parentId: string | null;
}

export interface CapabilityChildSummary {
  id: string;
  uniqueName: string;
  type: CapabilityType;
}

export interface CapabilityParentSummary {
  id: string;
  uniqueName: string;
}

export interface CapabilityDetail extends Capability {
  parent: CapabilityParentSummary | null;
  children: CapabilityChildSummary[];
}

export interface CapabilityBreadcrumb {
  id: string;
  uniqueName: string;
}

export interface CapabilitySubtreeNode extends Capability {
  children: CapabilitySubtreeNode[];
}

export type SubtreeNode = CapabilitySubtreeNode;

export interface CapabilityListResponse {
  items: CapabilitySummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function capabilityKey(id: string) {
  return [...CAPABILITIES_KEY, 'detail', id] as const;
}

type QueryParamValue = string | number | undefined;
type QueryParams = CapabilityQueryParams | FlaggedCapabilityQueryParams;

function normalizeQueryParams(params?: QueryParams) {
  const normalizedParams: Record<string, string> = {};

  if (!params) {
    return normalizedParams;
  }

  const entries = Object.entries(params) as Array<[string, QueryParamValue]>;

  for (const [key, value] of entries) {
    if (value === undefined || value === '') {
      continue;
    }

    normalizedParams[key] = String(value);
  }

  return normalizedParams;
}

function capabilityListKey(params?: CapabilityQueryParams) {
  const normalizedParams = normalizeQueryParams(params);

  if (Object.keys(normalizedParams).length === 0) {
    return [...CAPABILITIES_KEY, 'list'] as const;
  }

  return [...CAPABILITIES_KEY, 'list', normalizedParams] as const;
}

function buildCapabilitiesPath(params?: CapabilityQueryParams) {
  const searchParams = new URLSearchParams(normalizeQueryParams(params));
  const search = searchParams.toString();

  return search ? `/capabilities?${search}` : '/capabilities';
}

function flaggedCapabilitiesKey(params?: FlaggedCapabilityQueryParams) {
  const normalizedParams = normalizeQueryParams(params);

  if (Object.keys(normalizedParams).length === 0) {
    return [...GUARDRAILS_KEY, 'flagged'] as const;
  }

  return [...GUARDRAILS_KEY, 'flagged', normalizedParams] as const;
}

function buildFlaggedCapabilitiesPath(params?: FlaggedCapabilityQueryParams) {
  const searchParams = new URLSearchParams(normalizeQueryParams(params));
  const search = searchParams.toString();

  return search ? `/guardrails/flagged?${search}` : '/guardrails/flagged';
}

export function useCapabilities(params?: CapabilityQueryParams, enabled = true) {
  return useQuery<CapabilityListResponse, Error>({
    queryKey: capabilityListKey(params),
    queryFn: () => apiClient.get<CapabilityListResponse>(buildCapabilitiesPath(params)),
    enabled,
  });
}

export function useCapability(id?: string) {
  return useQuery<CapabilityDetail, Error>({
    queryKey: capabilityKey(id ?? 'unknown'),
    queryFn: () => apiClient.get<CapabilityDetail>(`/capabilities/${id}`),
    enabled: !!id,
  });
}

export function useCapabilityBreadcrumbs(id?: string) {
  return useQuery<CapabilityBreadcrumb[], Error>({
    queryKey: [...capabilityKey(id ?? 'unknown'), 'breadcrumbs'],
    queryFn: () => apiClient.get<CapabilityBreadcrumb[]>(`/capabilities/${id}/breadcrumbs`),
    enabled: !!id,
  });
}

export function useCapabilitySubtree(id?: string) {
  return useQuery<CapabilitySubtreeNode, Error>({
    queryKey: [...capabilityKey(id ?? 'unknown'), 'subtree'],
    queryFn: () => apiClient.get<CapabilitySubtreeNode>(`/capabilities/${id}/subtree`),
    enabled: !!id,
  });
}

export function useCapabilityLeaves(id?: string) {
  return useQuery<CapabilitySummary[], Error>({
    queryKey: [...capabilityKey(id ?? 'unknown'), 'leaves'],
    queryFn: () => apiClient.get<CapabilitySummary[]>(`/capabilities/${id}/leaves`),
    enabled: !!id,
  });
}

export function useCapabilityStewardship(id?: string) {
  return useQuery<CapabilityStewardship, Error>({
    queryKey: [...capabilityKey(id ?? 'unknown'), 'stewardship'],
    queryFn: () => apiClient.get<CapabilityStewardship>(`/capabilities/${id}/stewardship`),
    enabled: !!id,
  });
}

export function useFlaggedCapabilities(params?: FlaggedCapabilityQueryParams) {
  return useQuery<FlaggedCapabilityListResponse, Error>({
    queryKey: flaggedCapabilitiesKey(params),
    queryFn: () => apiClient.get<FlaggedCapabilityListResponse>(buildFlaggedCapabilitiesPath(params)),
  });
}

export function useCreateCapability() {
  const queryClient = useQueryClient();

  return useMutation<Capability, Error, CreateCapabilityInput>({
    mutationFn: (input) =>
      apiClient.post<Capability>('/capabilities', input, getIdentityHeaders()),
    onSuccess: (data) => {
      queryClient.removeQueries({ queryKey: capabilityKey(data.id) });
      void queryClient.invalidateQueries({ queryKey: CAPABILITIES_KEY });
    },
  });
}

export function useUpdateCapability(id: string) {
  const queryClient = useQueryClient();

  return useMutation<Capability, Error, UpdateCapabilityInput>({
    mutationFn: (input) =>
      apiClient.patch<Capability>(`/capabilities/${id}`, input, getIdentityHeaders()),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: capabilityKey(id) });
      void queryClient.invalidateQueries({ queryKey: CAPABILITIES_KEY });
    },
  });
}

export function useDeleteCapability() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClient.delete<void>(`/capabilities/${id}`, getIdentityHeaders()),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: capabilityKey(id) });
      void queryClient.invalidateQueries({ queryKey: CAPABILITIES_KEY });
    },
  });
}
