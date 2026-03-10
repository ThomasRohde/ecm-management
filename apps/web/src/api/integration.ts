import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDownstreamConsumerInput,
  DownstreamConsumer,
  DownstreamConsumerEventLogResponse,
  DownstreamConsumerHealthSummary,
  DownstreamConsumerListResponse,
  TransformationProfileListResponse,
  UpdateDownstreamConsumerInput,
} from '@ecm/shared';
import { DeliveryStatus, HealthStatus } from '@ecm/shared';
import { apiClient } from './client';
import { getIdentityHeaders } from './identity';

const DOWNSTREAM_CONSUMERS_KEY = ['downstream-consumers'] as const;
const DOWNSTREAM_CONSUMER_HEALTH_KEY = ['downstream-consumer-health'] as const;
const DOWNSTREAM_CONSUMER_EVENT_LOG_KEY = ['downstream-consumer-event-log'] as const;
const TRANSFORMATION_PROFILES_KEY = ['transformation-profiles'] as const;

export interface DownstreamConsumerQueryParams {
  healthStatus?: HealthStatus;
  page?: number;
  limit?: number;
}

export interface DownstreamConsumerEventLogQueryParams {
  consumerId?: string;
  limit?: number;
  offset?: number;
}

function downstreamConsumerListKey(params?: DownstreamConsumerQueryParams) {
  const keyParams: Record<string, string> = {};
  if (params?.healthStatus) keyParams.healthStatus = params.healthStatus;
  if (params?.page != null) keyParams.page = String(params.page);
  if (params?.limit != null) keyParams.limit = String(params.limit);

  return Object.keys(keyParams).length > 0
    ? ([...DOWNSTREAM_CONSUMERS_KEY, 'list', keyParams] as const)
    : ([...DOWNSTREAM_CONSUMERS_KEY, 'list'] as const);
}

function downstreamConsumerEventLogKey(params?: DownstreamConsumerEventLogQueryParams) {
  const keyParams: Record<string, string> = {};
  if (params?.consumerId) keyParams.consumerId = params.consumerId;
  if (params?.limit != null) keyParams.limit = String(params.limit);
  if (params?.offset != null) keyParams.offset = String(params.offset);

  return Object.keys(keyParams).length > 0
    ? ([...DOWNSTREAM_CONSUMER_EVENT_LOG_KEY, keyParams] as const)
    : DOWNSTREAM_CONSUMER_EVENT_LOG_KEY;
}

export function buildDownstreamConsumersPath(
  params?: DownstreamConsumerQueryParams,
): string {
  const searchParams = new URLSearchParams();
  if (params?.healthStatus) searchParams.set('healthStatus', params.healthStatus);
  if (params?.page != null) searchParams.set('page', String(params.page));
  if (params?.limit != null) searchParams.set('limit', String(params.limit));
  const search = searchParams.toString();

  return search ? `/downstream-consumers?${search}` : '/downstream-consumers';
}

export function buildDownstreamConsumerEventLogPath(
  params?: DownstreamConsumerEventLogQueryParams,
): string {
  const searchParams = new URLSearchParams();
  if (params?.consumerId) searchParams.set('consumerId', params.consumerId);
  if (params?.limit != null) searchParams.set('limit', String(params.limit));
  if (params?.offset != null) searchParams.set('offset', String(params.offset));
  const search = searchParams.toString();

  return search ? `/downstream-consumers/events?${search}` : '/downstream-consumers/events';
}

export function getHealthStatusBadgeVariant(status: HealthStatus): 'positive' | 'warning' | 'negative' {
  switch (status) {
    case HealthStatus.HEALTHY:
      return 'positive';
    case HealthStatus.DEGRADED:
      return 'warning';
    case HealthStatus.UNHEALTHY:
      return 'negative';
  }
}

export function getDeliveryStatusBadgeVariant(
  status: DeliveryStatus,
): 'neutral' | 'positive' | 'warning' | 'negative' {
  switch (status) {
    case DeliveryStatus.PENDING:
      return 'neutral';
    case DeliveryStatus.DELIVERED:
      return 'positive';
    case DeliveryStatus.RETRYING:
      return 'warning';
    case DeliveryStatus.FAILED:
      return 'negative';
  }
}

export function useDownstreamConsumers(
  params?: DownstreamConsumerQueryParams,
  enabled = true,
) {
  return useQuery<DownstreamConsumerListResponse, Error>({
    queryKey: downstreamConsumerListKey(params),
    queryFn: () =>
      apiClient.get<DownstreamConsumerListResponse>(
        buildDownstreamConsumersPath(params),
        getIdentityHeaders(),
      ),
    enabled,
  });
}

export function useDownstreamConsumerHealthSummary(enabled = true) {
  return useQuery<DownstreamConsumerHealthSummary, Error>({
    queryKey: DOWNSTREAM_CONSUMER_HEALTH_KEY,
    queryFn: () =>
      apiClient.get<DownstreamConsumerHealthSummary>(
        '/downstream-consumers/health',
        getIdentityHeaders(),
      ),
    enabled,
  });
}

export function useDownstreamConsumerEventLog(
  params?: DownstreamConsumerEventLogQueryParams,
  enabled = true,
) {
  return useQuery<DownstreamConsumerEventLogResponse, Error>({
    queryKey: downstreamConsumerEventLogKey(params),
    queryFn: () =>
      apiClient.get<DownstreamConsumerEventLogResponse>(
        buildDownstreamConsumerEventLogPath(params),
        getIdentityHeaders(),
      ),
    enabled,
  });
}

export function useTransformationProfiles(enabled = true) {
  return useQuery<TransformationProfileListResponse, Error>({
    queryKey: TRANSFORMATION_PROFILES_KEY,
    queryFn: () =>
      apiClient.get<TransformationProfileListResponse>(
        '/downstream-consumers/transformation-profiles',
        getIdentityHeaders(),
      ),
    enabled,
  });
}

export function useCreateDownstreamConsumer() {
  const queryClient = useQueryClient();

  return useMutation<DownstreamConsumer, Error, CreateDownstreamConsumerInput>({
    mutationFn: (input) =>
      apiClient.post<DownstreamConsumer>(
        '/downstream-consumers',
        input,
        getIdentityHeaders(),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DOWNSTREAM_CONSUMERS_KEY });
      void queryClient.invalidateQueries({ queryKey: DOWNSTREAM_CONSUMER_HEALTH_KEY });
      void queryClient.invalidateQueries({ queryKey: DOWNSTREAM_CONSUMER_EVENT_LOG_KEY });
    },
  });
}

export function useUpdateDownstreamConsumer() {
  const queryClient = useQueryClient();

  return useMutation<
    DownstreamConsumer,
    Error,
    { id: string; input: UpdateDownstreamConsumerInput }
  >({
    mutationFn: ({ id, input }) =>
      apiClient.patch<DownstreamConsumer>(
        `/downstream-consumers/${id}`,
        input,
        getIdentityHeaders(),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DOWNSTREAM_CONSUMERS_KEY });
      void queryClient.invalidateQueries({ queryKey: DOWNSTREAM_CONSUMER_HEALTH_KEY });
      void queryClient.invalidateQueries({ queryKey: DOWNSTREAM_CONSUMER_EVENT_LOG_KEY });
    },
  });
}

export function useDeleteDownstreamConsumer() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) =>
      apiClient.delete<void>(`/downstream-consumers/${id}`, getIdentityHeaders()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DOWNSTREAM_CONSUMERS_KEY });
      void queryClient.invalidateQueries({ queryKey: DOWNSTREAM_CONSUMER_HEALTH_KEY });
      void queryClient.invalidateQueries({ queryKey: DOWNSTREAM_CONSUMER_EVENT_LOG_KEY });
    },
  });
}
