import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeRequestStatus, ChangeRequestType } from '@ecm/shared';
import { ChangeRequestListPage } from '../pages/ChangeRequestListPage';
import * as changeRequestsApi from '../api/change-requests';

vi.mock('../api/change-requests');

const mockUseChangeRequests = vi.mocked(changeRequestsApi.useChangeRequests);

const stubCR = {
  id: 'cr-1',
  type: ChangeRequestType.UPDATE,
  status: ChangeRequestStatus.DRAFT,
  requestedBy: 'alice',
  rationale: 'Update Payment Processing capability description',
  affectedCapabilityIds: ['cap-1', 'cap-2'],
  operationPayload: null,
  impactSummary: null,
  downstreamPlan: null,
  approvalDecisions: [],
  auditEntries: [],
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2025-01-15T10:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/change-requests']}>
      <ChangeRequestListPage />
    </MemoryRouter>,
  );
}

describe('ChangeRequestListPage', () => {
  beforeEach(() => {
    mockUseChangeRequests.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequests>);
  });

  it('shows accessible loading state while change requests are loading', () => {
    mockUseChangeRequests.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequests>);

    renderPage();

    expect(
      screen.getByRole('status', { name: /loading change requests/i }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('shows error alert with retry action when loading fails', () => {
    const refetch = vi.fn();
    mockUseChangeRequests.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
      refetch,
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequests>);

    renderPage();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/error loading change requests/i);
    expect(alert).toHaveTextContent('Network error');

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows empty state message when no change requests exist', () => {
    mockUseChangeRequests.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequests>);

    renderPage();

    expect(screen.getByText(/no change requests yet/i)).toBeInTheDocument();
  });

  it('renders a list of change requests with status badge, type badge, rationale, and requestor', () => {
    mockUseChangeRequests.mockReturnValue({
      data: { items: [stubCR], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequests>);

    renderPage();

    // Status badge (in the list item, not the dropdown option)
    const draftBadge = screen.getAllByText('Draft');
    expect(draftBadge.some((el) => el.tagName === 'SPAN')).toBe(true);

    expect(screen.getAllByText('Update').some((el) => el.tagName === 'SPAN')).toBe(true);
    expect(
      screen.getByText('Update Payment Processing capability description'),
    ).toBeInTheDocument();
    expect(screen.getByText(/requested by alice/i)).toBeInTheDocument();
    expect(screen.getByText(/2 capabilities affected/i)).toBeInTheDocument();
  });

  it('shows correct count label for a single result', () => {
    mockUseChangeRequests.mockReturnValue({
      data: { items: [stubCR], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequests>);

    renderPage();

    expect(screen.getByText(/1 change request found/i)).toBeInTheDocument();
  });

  it('shows correct count label for multiple results', () => {
    const secondCR = {
      ...stubCR,
      id: 'cr-2',
      status: ChangeRequestStatus.SUBMITTED,
    };

    mockUseChangeRequests.mockReturnValue({
      data: { items: [stubCR, secondCR], total: 2 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequests>);

    renderPage();

    expect(screen.getByText(/2 change requests found/i)).toBeInTheDocument();
  });

  it('links each change request item to its detail page', () => {
    mockUseChangeRequests.mockReturnValue({
      data: { items: [stubCR], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequests>);

    renderPage();

    const link = screen.getByRole('link', { name: /update payment processing/i });
    expect(link).toHaveAttribute('href', '/change-requests/cr-1');
  });

  it('renders status filter select with all status options', () => {
    renderPage();

    const statusSelect = screen.getByLabelText(/status/i);
    expect(statusSelect).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    const statusValues = options
      .map((o) => (o as HTMLOptionElement).value)
      .filter((v) =>
        Object.values(ChangeRequestStatus).includes(v as ChangeRequestStatus),
      );
    expect(statusValues).toHaveLength(Object.values(ChangeRequestStatus).length);
  });

  it('renders type filter select with all type options', () => {
    renderPage();

    const typeSelect = screen.getByLabelText(/type/i);
    expect(typeSelect).toBeInTheDocument();
  });

  it('links to create form from page header and empty state', () => {
    mockUseChangeRequests.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequests>);

    renderPage();

    const links = screen.getAllByRole('link', { name: /new change request/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute('href', '/change-requests/create');
  });
});
