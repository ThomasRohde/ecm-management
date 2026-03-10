import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeliveryStatus, HealthStatus } from '@ecm/shared';
import { IntegrationConsumersPage } from './IntegrationConsumersPage';
import * as permissions from '../auth/permissions';

const mockRefetch = vi.fn();
const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();

vi.mock('../auth/permissions');
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
  })),
}));

vi.mock('../api/integration', async () => {
  const actual = await vi.importActual('../api/integration');

  return {
    ...actual,
    useDownstreamConsumers: vi.fn(() => ({
      data: {
        items: [
          {
            id: 'consumer-1',
            name: 'ServiceNow',
            contractType: 'REST_API',
            syncMode: 'REALTIME',
            transformationProfile: 'published-model-v1',
            transformationProfileDetails: {
              id: 'published-model-v1',
              name: 'Published model envelope v1',
              description: 'Wraps publish events in a generic published-model envelope.',
              supportedContractTypes: ['REST_API'],
              defaultSyncMode: 'REALTIME',
            },
            healthStatus: HealthStatus.HEALTHY,
            status: {
              lastAttemptAt: '2026-03-10T10:00:00.000Z',
              lastDeliveredAt: '2026-03-10T10:00:00.000Z',
              deliveredCount: 2,
              failedCount: 0,
              lastFailureMessage: null,
            },
            createdAt: '2026-03-10T08:00:00.000Z',
            updatedAt: '2026-03-10T09:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 25,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })),
    useDownstreamConsumerHealthSummary: vi.fn(() => ({
      data: {
        totalConsumers: 1,
        healthyConsumers: 1,
        degradedConsumers: 0,
        unhealthyConsumers: 0,
        pendingEvents: 3,
        retryingEvents: 0,
        failedEvents: 0,
        deliveredEvents: 12,
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })),
    useTransformationProfiles: vi.fn(() => ({
      data: {
        items: [
          {
            id: 'published-model-v1',
            name: 'Published model envelope v1',
            description: 'Wraps publish events in a generic published-model envelope.',
            supportedContractTypes: ['REST_API', 'WEBHOOK'],
            defaultSyncMode: 'REALTIME',
          },
        ],
        total: 1,
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })),
    useDownstreamConsumerEventLog: vi.fn(() => ({
      data: {
        items: [
          {
            auditId: 'audit-1',
            consumerId: 'consumer-1',
            consumerName: 'ServiceNow',
            publishEventId: 'event-1',
            modelVersionId: 'version-1',
            entityId: 'capability-1',
            eventType: 'model-version.published',
            deliveryStatus: DeliveryStatus.DELIVERED,
            attemptedAt: '2026-03-10T10:00:00.000Z',
            transformationProfile: 'published-model-v1',
            message: 'Delivered to scaffolded downstream transport.',
            evidence: { payloadSchema: 'published-model.v1' },
          },
        ],
        total: 1,
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })),
    useCreateDownstreamConsumer: vi.fn(() => ({
      mutateAsync: mockCreateMutateAsync,
      isPending: false,
    })),
    useUpdateDownstreamConsumer: vi.fn(() => ({
      mutateAsync: mockUpdateMutateAsync,
      isPending: false,
    })),
    useDeleteDownstreamConsumer: vi.fn(() => ({
      mutateAsync: mockDeleteMutateAsync,
      isPending: false,
    })),
  };
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <IntegrationConsumersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('IntegrationConsumersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(permissions.canManageDownstreamConsumers).mockReturnValue(true);
    mockCreateMutateAsync.mockResolvedValue(undefined);
    mockUpdateMutateAsync.mockResolvedValue(undefined);
    mockDeleteMutateAsync.mockResolvedValue(undefined);
  });

  it('renders the registry, health summary, and event log', () => {
    renderPage();

    expect(
      screen.getByText(/register downstream consumers, monitor their health posture/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText('ServiceNow').length).toBeGreaterThan(0);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/delivered to scaffolded downstream transport/i)).toBeInTheDocument();
  });

  it('shows a permission error when the user cannot manage downstream consumers', () => {
    vi.mocked(permissions.canManageDownstreamConsumers).mockReturnValue(false);

    renderPage();

    expect(screen.getByText(/insufficient permissions/i)).toBeInTheDocument();
  });

  it('submits the create form through the consumer create mutation', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/consumer name/i), {
      target: { value: 'Analytics Lake' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create consumer/i }));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        name: 'Analytics Lake',
        contractType: 'REST_API',
        syncMode: 'REALTIME',
        transformationProfile: 'published-model-v1',
        healthStatus: HealthStatus.HEALTHY,
      });
    });
  });
});
