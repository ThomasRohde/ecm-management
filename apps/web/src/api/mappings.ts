import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateMappingInput, Mapping, MappingListResponse, UpdateMappingInput } from '@ecm/shared';
import { MappingState } from '@ecm/shared';
import { apiClient } from './client';
import { getIdentityHeaders } from './identity';
import type { MappingDisplayDto, MappingFormValues } from '../components/mapping/mapping.types';

// ─── Query key roots ──────────────────────────────────────────────────────────

const MAPPINGS_KEY = ['mappings'] as const;
const CAPABILITIES_KEY = ['capabilities'] as const;

// ─── Query key factories ──────────────────────────────────────────────────────

function mappingKey(id: string) {
  return [...MAPPINGS_KEY, 'detail', id] as const;
}

function capabilityMappingsKey(capabilityId: string) {
  return [...CAPABILITIES_KEY, 'detail', capabilityId, 'mappings'] as const;
}

function mappingListKey(params?: MappingQueryParams) {
  const paramEntries: Record<string, string> = {};
  if (params?.state) paramEntries.state = params.state;
  if (params?.systemId) paramEntries.systemId = params.systemId;
  if (Object.keys(paramEntries).length === 0) {
    return [...MAPPINGS_KEY, 'list'] as const;
  }
  return [...MAPPINGS_KEY, 'list', paramEntries] as const;
}

// ─── Query params ─────────────────────────────────────────────────────────────

export interface MappingQueryParams {
  state?: MappingState;
  systemId?: string;
  page?: number;
  limit?: number;
}

function buildMappingsPath(params?: MappingQueryParams): string {
  const searchParams = new URLSearchParams();
  if (params?.state) searchParams.set('state', params.state);
  if (params?.systemId) searchParams.set('systemId', params.systemId);
  if (params?.page != null) searchParams.set('page', String(params.page));
  if (params?.limit != null) searchParams.set('limit', String(params.limit));
  const search = searchParams.toString();
  return search ? `/mappings?${search}` : '/mappings';
}

// ─── Adapters ─────────────────────────────────────────────────────────────────

/**
 * Enriches a raw Mapping with display-friendly fields required by MappingDisplayDto.
 *
 * systemName is read from attributes.systemName (stored on create via the form)
 * and falls back to systemId when absent.  capabilityName must be supplied by
 * the caller; use the capability's uniqueName from a sibling query or pass
 * capabilityId as a fallback for global list views.
 */
export function toMappingDisplayDto(
  mapping: Mapping,
  capabilityName: string,
): MappingDisplayDto {
  const systemName =
    (mapping.attributes?.['systemName'] as string | undefined) ?? mapping.systemId;
  return { ...mapping, systemName, capabilityName };
}

/**
 * Converts MappingFormValues collected by AddMappingDialog to a CreateMappingInput
 * for POST /mappings.  systemName and notes are stored inside the attributes bag
 * since CreateMappingInput does not carry them as top-level fields.
 */
export function mappingFormValuesToCreateInput(
  values: MappingFormValues,
  capabilityId: string,
): CreateMappingInput {
  const attributes: Record<string, unknown> = { systemName: values.systemName };
  if (values.notes) {
    attributes['notes'] = values.notes;
  }
  return {
    systemId: values.systemId,
    capabilityId,
    mappingType: values.mappingType,
    state: values.state,
    attributes,
  };
}

/**
 * Converts MappingFormValues collected by EditMappingDialog to an UpdateMappingInput
 * for PATCH /mappings/:id.  systemId and capabilityId are immutable after creation
 * and are intentionally excluded from the update payload.
 */
export function mappingFormValuesToUpdateInput(values: MappingFormValues): UpdateMappingInput {
  const attributes: Record<string, unknown> = { systemName: values.systemName };
  if (values.notes) {
    attributes['notes'] = values.notes;
  }
  return {
    mappingType: values.mappingType,
    state: values.state,
    attributes,
  };
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

/**
 * Fetch the paginated / filtered global mapping list via GET /mappings.
 * Used by the dedicated Mappings management page.
 */
export function useMappings(params?: MappingQueryParams) {
  return useQuery<MappingListResponse, Error>({
    queryKey: mappingListKey(params),
    queryFn: () => apiClient.get<MappingListResponse>(buildMappingsPath(params)),
  });
}

/**
 * Fetch all mappings for a specific capability via
 * GET /capabilities/:capabilityId/mappings.
 */
export function useCapabilityMappings(capabilityId?: string) {
  return useQuery<Mapping[], Error>({
    queryKey: capabilityMappingsKey(capabilityId ?? 'unknown'),
    queryFn: () => apiClient.get<Mapping[]>(`/capabilities/${capabilityId}/mappings`),
    enabled: !!capabilityId,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

/** Create a new mapping via POST /mappings. */
export function useCreateMapping() {
  const queryClient = useQueryClient();
  return useMutation<Mapping, Error, CreateMappingInput>({
    mutationFn: (input) =>
      apiClient.post<Mapping>('/mappings', input, getIdentityHeaders()),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: MAPPINGS_KEY });
      void queryClient.invalidateQueries({
        queryKey: capabilityMappingsKey(variables.capabilityId),
      });
    },
  });
}

/**
 * Update an existing mapping via PATCH /mappings/:id.
 * The mutation variable includes id and capabilityId so the hook can be used
 * from both the capability detail page and the global mappings page without
 * needing to know the target ID at hook-creation time.
 */
export function useUpdateMapping() {
  const queryClient = useQueryClient();
  return useMutation<Mapping, Error, { id: string; input: UpdateMappingInput; capabilityId: string }>({
    mutationFn: ({ id, input }) =>
      apiClient.patch<Mapping>(`/mappings/${id}`, input, getIdentityHeaders()),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(mappingKey(variables.id), data);
      void queryClient.invalidateQueries({ queryKey: MAPPINGS_KEY });
      void queryClient.invalidateQueries({
        queryKey: capabilityMappingsKey(variables.capabilityId),
      });
    },
  });
}

/**
 * Delete a mapping via DELETE /mappings/:id.
 * capabilityId is required alongside id to ensure the capability-scoped query
 * cache is invalidated after deletion.
 */
export function useDeleteMapping() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; capabilityId: string }>({
    mutationFn: ({ id }) =>
      apiClient.delete<void>(`/mappings/${id}`, getIdentityHeaders()),
    onSuccess: (_data, variables) => {
      queryClient.removeQueries({ queryKey: mappingKey(variables.id) });
      void queryClient.invalidateQueries({ queryKey: MAPPINGS_KEY });
      void queryClient.invalidateQueries({
        queryKey: capabilityMappingsKey(variables.capabilityId),
      });
    },
  });
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { MappingState };
export type { Mapping, MappingListResponse };
