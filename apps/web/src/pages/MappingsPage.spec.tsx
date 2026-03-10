import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MappingState } from '@ecm/shared';
import type { MappingDisplayDto } from '../components/mapping/mapping.types';
import { MappingsPage } from './MappingsPage';
import * as permissions from '../auth/permissions';

// ─── Hook mocks ───────────────────────────────────────────────────────────────

const mockRefetch = vi.fn();
const mockMutateAsync = vi.fn();

vi.mock('../auth/permissions');

vi.mock('../api/mappings', () => ({
  useMappings: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  })),
  useUpdateMapping: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  })),
  useDeleteMapping: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  })),
  toMappingDisplayDto: vi.fn((m: { systemId: string; capabilityId: string }, name: string) => ({
    ...m,
    systemName: m.systemId,
    capabilityName: name,
  })),
  mappingFormValuesToUpdateInput: vi.fn((v: unknown) => v),
  MappingState: {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    PENDING: 'PENDING',
  },
}));

// ─── Render helper ────────────────────────────────────────────────────────────

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MappingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Stub MappingDisplayDto ───────────────────────────────────────────────────

function makeDisplayDto(overrides: Partial<MappingDisplayDto> = {}): MappingDisplayDto {
  return {
    id: 'map-1',
    systemId: 'SYS-001',
    systemName: 'Payments Hub',
    capabilityId: 'cap-1',
    capabilityName: 'Payment Processing',
    mappingType: 'CONSUMES',
    state: MappingState.ACTIVE,
    attributes: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MappingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock permissions - default to allowing mapping management
    vi.mocked(permissions.canManageMappings).mockReturnValue(true);
  });

  it('renders the page heading', () => {
    renderPage();
    // The page-level description is unique; the heading "Mappings" also appears in MappingTable.
    expect(
      screen.getByText(/view and manage system-to-capability mappings across the model/i),
    ).toBeInTheDocument();
  });

  it('renders the state filter dropdown', () => {
    renderPage();
    expect(screen.getByLabelText(/state/i)).toBeInTheDocument();
  });

  it('renders the system ID search input', () => {
    renderPage();
    expect(screen.getByLabelText(/system id/i)).toBeInTheDocument();
  });

  it('renders the search button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('shows the empty-state hint when no mappings are available', () => {
    renderPage();
    expect(
      screen.getByText(/no mappings have been added yet/i),
    ).toBeInTheDocument();
  });

  it('does not render a "Clear filters" button when no filters are active', () => {
    renderPage();
    expect(
      screen.queryByRole('button', { name: /clear filters/i }),
    ).not.toBeInTheDocument();
  });

  it('shows "Clear filters" button after submitting a system ID search', () => {
    renderPage();

    const input = screen.getByLabelText(/system id/i);
    fireEvent.change(input, { target: { value: 'SYS-001' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('resets filters when "Clear filters" is clicked', () => {
    renderPage();

    const input = screen.getByLabelText(/system id/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'SYS-001' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(input.value).toBe('');
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });

  it('shows filter-specific empty message when filters are active', async () => {
    const { useMappings } = await import('../api/mappings');
    vi.mocked(useMappings).mockReturnValueOnce({
      data: { items: [], total: 0, page: 1, limit: 25, totalPages: 0 },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof useMappings>);

    renderPage();

    // Activate state filter so "hasFilters" is true
    const select = screen.getByLabelText(/state/i);
    fireEvent.change(select, { target: { value: 'ACTIVE' } });

    expect(
      screen.getByText(/no mappings match the current filters/i),
    ).toBeInTheDocument();
  });

  it('renders mapping rows when data is available', async () => {
    const { useMappings, toMappingDisplayDto } = await import('../api/mappings');
    const dto = makeDisplayDto();

    vi.mocked(toMappingDisplayDto).mockReturnValue(dto);
    vi.mocked(useMappings).mockReturnValueOnce({
      data: { items: [dto], total: 1, page: 1, limit: 25, totalPages: 1 },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof useMappings>);

    renderPage();

    expect(screen.getByText('Payments Hub')).toBeInTheDocument();
  });

  it('opens the edit dialog when Edit is clicked', async () => {
    const { useMappings, toMappingDisplayDto } = await import('../api/mappings');
    const dto = makeDisplayDto();

    vi.mocked(toMappingDisplayDto).mockReturnValue(dto);
    vi.mocked(useMappings).mockReturnValueOnce({
      data: { items: [dto], total: 1, page: 1, limit: 25, totalPages: 1 },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof useMappings>);

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /edit payments hub/i }));

    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
  });
});
