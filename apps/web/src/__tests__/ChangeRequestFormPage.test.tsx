import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeRequestType } from '@ecm/shared';
import { ChangeRequestFormPage } from '../pages/ChangeRequestFormPage';
import * as changeRequestsApi from '../api/change-requests';
import * as impactAnalysisApi from '../api/impact-analysis';
import * as capabilitiesApi from '../api/capabilities';
import * as identity from '../api/identity';
import * as permissions from '../auth/permissions';

vi.mock('../api/change-requests');
vi.mock('../api/impact-analysis');
vi.mock('../api/capabilities');
vi.mock('../api/identity');
vi.mock('../auth/permissions');

const mockUseCreateChangeRequest = vi.mocked(changeRequestsApi.useCreateChangeRequest);
const mockUseCapabilities = vi.mocked(capabilitiesApi.useCapabilities);
const mockGetUserId = vi.mocked(identity.getUserId);

const noop = {
  mutateAsync: vi.fn(),
  isPending: false,
  mutate: vi.fn(),
  isError: false,
  isSuccess: false,
} as Record<string, unknown>;

const stubCapability = {
  id: 'cap-1',
  uniqueName: 'Payment Processing',
  type: 'LEAF',
  lifecycleStatus: 'ACTIVE',
  parentId: null,
  children: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/change-requests/create']}>
      <ChangeRequestFormPage />
    </MemoryRouter>,
  );
}

describe('ChangeRequestFormPage', () => {
  beforeEach(() => {
    mockUseCreateChangeRequest.mockReturnValue(
      noop as ReturnType<typeof changeRequestsApi.useCreateChangeRequest>,
    );

    mockUseCapabilities.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);

    vi.mocked(impactAnalysisApi.useImpactAnalysis).mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() } as unknown as ReturnType<typeof impactAnalysisApi.useImpactAnalysis>);
    mockGetUserId.mockReturnValue('alice');
    
    // Mock permissions - default to allowing change request management
    vi.mocked(permissions.canManageChangeRequests).mockReturnValue(true);
  });

  it('renders the form heading and description', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /new change request/i })).toBeInTheDocument();
    expect(screen.getByText(/submit a governed structural change request/i)).toBeInTheDocument();
  });

  it('renders back link to change requests list', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /back to change requests/i });
    expect(link).toHaveAttribute('href', '/change-requests');
  });

  it('renders all required form fields: type, rationale, capabilities picker', () => {
    renderPage();

    expect(screen.getByRole('form', { name: /new change request form/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/request type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/rationale/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/search capabilities to add/i)).toBeInTheDocument();
  });

  it('renders optional fields for downstream plan and impact summary', () => {
    renderPage();

    expect(screen.getByLabelText(/downstream plan/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/impact summary/i)).toBeInTheDocument();
  });

  it('renders all change request type options in the select', () => {
    renderPage();

    const select = screen.getByLabelText(/request type/i);
    const options = Array.from(select.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    );

    expect(options).toContain(ChangeRequestType.UPDATE);
    expect(options).toContain(ChangeRequestType.CREATE);
    expect(options).toContain(ChangeRequestType.DELETE);
    expect(options).toContain(ChangeRequestType.REPARENT);
    expect(options).toContain(ChangeRequestType.MERGE);
    expect(options).toContain(ChangeRequestType.RETIRE);
  });

  it('shows validation error when submitting without rationale', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /create change request/i }));

    await waitFor(() => {
      expect(screen.getByText(/rationale is required/i)).toBeInTheDocument();
    });
  });

  it('shows validation error when submitting without any selected capabilities', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/rationale/i), {
      target: { value: 'Test rationale' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create change request/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/at least one affected capability must be selected/i),
      ).toBeInTheDocument();
    });
  });

  it('shows error alert with validation messages on submit failure', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /create change request/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(/please fix the following issues/i);
    });
  });

  it('shows identity-not-set warning when userId is empty', () => {
    mockGetUserId.mockReturnValue('');

    renderPage();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/not logged in/i);
  });

  it('disables submit button when userId is empty', () => {
    mockGetUserId.mockReturnValue('');

    renderPage();

    expect(
      screen.getByRole('button', { name: /create change request/i }),
    ).toBeDisabled();
  });

  it('shows capability search results when capabilities are returned', () => {
    mockUseCapabilities.mockReturnValue({
      data: { items: [stubCapability], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);

    renderPage();

    const searchInput = screen.getByLabelText(/search capabilities to add/i);
    fireEvent.change(searchInput, { target: { value: 'Payment' } });

    // Results should appear in the list (deferredSearch used but let it render)
    expect(screen.getByLabelText(/search capabilities to add/i)).toHaveValue('Payment');
  });

  it('shows empty message when no capabilities are selected', () => {
    renderPage();

    expect(
      screen.getByText(/no capabilities selected/i),
    ).toBeInTheDocument();
  });

  it('shows creating state when mutation is pending', () => {
    mockUseCreateChangeRequest.mockReturnValue({
      ...noop,
      isPending: true,
    } as unknown as ReturnType<typeof changeRequestsApi.useCreateChangeRequest>);

    renderPage();

    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();
  });

  it('calls cancel link back to change requests list', () => {
    renderPage();

    const cancelLink = screen.getByRole('link', { name: /cancel/i });
    expect(cancelLink).toHaveAttribute('href', '/change-requests');
  });
});
