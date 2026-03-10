import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DownstreamConsumerEventLogResponse,
  DownstreamConsumerHealthSummary,
  DownstreamConsumerListResponse,
  TransformationProfileListResponse,
} from '@ecm/shared';
import { DeliveryStatus, HealthStatus } from '@ecm/shared';
import {
  buildDownstreamConsumerEventLogPath,
  buildDownstreamConsumersPath,
  getDeliveryStatusBadgeVariant,
  getHealthStatusBadgeVariant,
  useDownstreamConsumerEventLog,
  useDownstreamConsumerHealthSummary,
  useDownstreamConsumers,
  useTransformationProfiles,
} from './integration';

const { mockGet, mockGetIdentityHeaders } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockGetIdentityHeaders: vi.fn(() => ({ Authorization: 'Bearer test-token' })),
}));

vi.mock('./client', () => ({
  apiClient: {
    get: mockGet,
  },
}));

vi.mock('./identity', () => ({
  getIdentityHeaders: mockGetIdentityHeaders,
}));

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('downstream consumer hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes identity headers when loading downstream consumers', async () => {
    const queryClient = createQueryClient();
    const response: DownstreamConsumerListResponse = {
      items: [],
      total: 0,
      page: 1,
      limit: 25,
      totalPages: 0,
    };
    mockGet.mockResolvedValue(response);

    const { result } = renderHook(() => useDownstreamConsumers(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGetIdentityHeaders).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/downstream-consumers', {
      Authorization: 'Bearer test-token',
    });
  });

  it('passes identity headers when loading the health summary', async () => {
    const queryClient = createQueryClient();
    const response: DownstreamConsumerHealthSummary = {
      totalConsumers: 1,
      healthyConsumers: 1,
      degradedConsumers: 0,
      unhealthyConsumers: 0,
      pendingEvents: 0,
      retryingEvents: 0,
      failedEvents: 0,
      deliveredEvents: 2,
    };
    mockGet.mockResolvedValue(response);

    const { result } = renderHook(() => useDownstreamConsumerHealthSummary(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/downstream-consumers/health', {
      Authorization: 'Bearer test-token',
    });
  });

  it('passes identity headers when loading the event log', async () => {
    const queryClient = createQueryClient();
    const response: DownstreamConsumerEventLogResponse = {
      items: [],
      total: 0,
    };
    mockGet.mockResolvedValue(response);

    const { result } = renderHook(
      () => useDownstreamConsumerEventLog({ consumerId: 'consumer-1', limit: 10 }),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/downstream-consumers/events?consumerId=consumer-1&limit=10',
      {
        Authorization: 'Bearer test-token',
      },
    );
  });

  it('passes identity headers when loading transformation profiles', async () => {
    const queryClient = createQueryClient();
    const response: TransformationProfileListResponse = {
      items: [],
      total: 0,
    };
    mockGet.mockResolvedValue(response);

    const { result } = renderHook(() => useTransformationProfiles(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/downstream-consumers/transformation-profiles', {
      Authorization: 'Bearer test-token',
    });
  });
});

describe('buildDownstreamConsumersPath', () => {
  it('returns the base path when no query params are supplied', () => {
    expect(buildDownstreamConsumersPath()).toBe('/downstream-consumers');
  });

  it('includes health and paging filters when supplied', () => {
    expect(
      buildDownstreamConsumersPath({
        healthStatus: HealthStatus.DEGRADED,
        page: 2,
        limit: 10,
      }),
    ).toBe('/downstream-consumers?healthStatus=DEGRADED&page=2&limit=10');
  });
});

describe('buildDownstreamConsumerEventLogPath', () => {
  it('returns the base event-log path when no query params are supplied', () => {
    expect(buildDownstreamConsumerEventLogPath()).toBe('/downstream-consumers/events');
  });

  it('includes the consumer filter and pagination when supplied', () => {
    expect(
      buildDownstreamConsumerEventLogPath({
        consumerId: 'consumer-1',
        limit: 15,
        offset: 30,
      }),
    ).toBe('/downstream-consumers/events?consumerId=consumer-1&limit=15&offset=30');
  });
});

describe('getHealthStatusBadgeVariant', () => {
  it('maps HEALTHY to the positive badge variant', () => {
    expect(getHealthStatusBadgeVariant(HealthStatus.HEALTHY)).toBe('positive');
  });

  it('maps DEGRADED to the warning badge variant', () => {
    expect(getHealthStatusBadgeVariant(HealthStatus.DEGRADED)).toBe('warning');
  });

  it('maps UNHEALTHY to the negative badge variant', () => {
    expect(getHealthStatusBadgeVariant(HealthStatus.UNHEALTHY)).toBe('negative');
  });
});

describe('getDeliveryStatusBadgeVariant', () => {
  it('maps pending and retrying statuses to neutral/warning variants', () => {
    expect(getDeliveryStatusBadgeVariant(DeliveryStatus.PENDING)).toBe('neutral');
    expect(getDeliveryStatusBadgeVariant(DeliveryStatus.RETRYING)).toBe('warning');
  });

  it('maps delivered and failed statuses to positive/negative variants', () => {
    expect(getDeliveryStatusBadgeVariant(DeliveryStatus.DELIVERED)).toBe('positive');
    expect(getDeliveryStatusBadgeVariant(DeliveryStatus.FAILED)).toBe('negative');
  });
});
