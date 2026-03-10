import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeRequestStatus, ChangeRequestType, ApprovalDecisionOutcome } from '@ecm/shared';
import { ChangeRequestDetailPage } from '../pages/ChangeRequestDetailPage';
import * as changeRequestsApi from '../api/change-requests';
import * as impactAnalysisApi from '../api/impact-analysis';
import * as identity from '../api/identity';
import * as permissions from '../auth/permissions';

vi.mock('../api/change-requests');
vi.mock('../api/impact-analysis');
vi.mock('../api/identity');
vi.mock('../auth/permissions');

const mockUseChangeRequest = vi.mocked(changeRequestsApi.useChangeRequest);
const mockGetUserId = vi.mocked(identity.getUserId);
const mockGetUserRole = vi.mocked(identity.getUserRole);

const stubCR: changeRequestsApi.ChangeRequestDetail = {
  id: 'cr-1',
  type: ChangeRequestType.UPDATE,
  status: ChangeRequestStatus.PENDING_APPROVAL,
  requestedBy: 'alice',
  rationale: 'Clarify scope of Payment Processing capability',
  affectedCapabilityIds: ['cap-abc-1', 'cap-abc-2'],
  operationPayload: null,
  impactSummary: 'Minor scope clarification only.',
  downstreamPlan: 'Notify downstream teams before publishing.',
  approvalDecisions: [
    {
      id: 'dec-1',
      changeRequestId: 'cr-1',
      approverRole: 'curator',
      approverId: 'bob',
      decision: ApprovalDecisionOutcome.APPROVED,
      comment: 'Looks good.',
      decidedAt: '2025-02-01T09:00:00.000Z',
    },
  ],
  auditEntries: [
    {
      id: 'audit-1',
      changeRequestId: 'cr-1',
      actorId: 'alice',
      eventType: 'CREATED',
      fromStatus: null,
      toStatus: ChangeRequestStatus.DRAFT,
      comment: null,
      metadata: null,
      createdAt: '2025-01-20T08:00:00.000Z',
    },
    {
      id: 'audit-2',
      changeRequestId: 'cr-1',
      actorId: 'alice',
      eventType: 'SUBMITTED',
      fromStatus: ChangeRequestStatus.DRAFT,
      toStatus: ChangeRequestStatus.SUBMITTED,
      comment: null,
      metadata: null,
      createdAt: '2025-01-20T09:00:00.000Z',
    },
  ],
  createdAt: '2025-01-20T08:00:00.000Z',
  updatedAt: '2025-01-20T09:00:00.000Z',
};

function renderPage(id = 'cr-1') {
  return render(
    <MemoryRouter initialEntries={[`/change-requests/${id}`]}>
      <Routes>
        <Route path="/change-requests/:id" element={<ChangeRequestDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Stub mutations to avoid errors when actions panel renders
const noop = {
  mutateAsync: vi.fn(),
  isPending: false,
  mutate: vi.fn(),
  isError: false,
  isSuccess: false,
} as unknown;

beforeEach(() => {
  vi.mocked(impactAnalysisApi.useChangeRequestImpact).mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() } as unknown as ReturnType<typeof impactAnalysisApi.useChangeRequestImpact>);
    vi.mocked(changeRequestsApi.useSubmitChangeRequest).mockReturnValue(noop as ReturnType<typeof changeRequestsApi.useSubmitChangeRequest>);
  vi.mocked(changeRequestsApi.useRequestApproval).mockReturnValue(noop as ReturnType<typeof changeRequestsApi.useRequestApproval>);
  vi.mocked(changeRequestsApi.useSubmitDecision).mockReturnValue(noop as ReturnType<typeof changeRequestsApi.useSubmitDecision>);
  vi.mocked(changeRequestsApi.useExecuteChangeRequest).mockReturnValue(noop as ReturnType<typeof changeRequestsApi.useExecuteChangeRequest>);
  vi.mocked(changeRequestsApi.useCompleteChangeRequest).mockReturnValue(noop as ReturnType<typeof changeRequestsApi.useCompleteChangeRequest>);
  vi.mocked(changeRequestsApi.useApplyStructuralOperation).mockReturnValue(noop as ReturnType<typeof changeRequestsApi.useApplyStructuralOperation>);
  vi.mocked(changeRequestsApi.useFailChangeRequest).mockReturnValue(noop as ReturnType<typeof changeRequestsApi.useFailChangeRequest>);
  vi.mocked(changeRequestsApi.useCancelChangeRequest).mockReturnValue(noop as ReturnType<typeof changeRequestsApi.useCancelChangeRequest>);

  mockGetUserId.mockReturnValue('alice');
  mockGetUserRole.mockReturnValue('governance-board');
  
  // Mock permissions - default to allowing all operations for these tests
  vi.mocked(permissions.canManageChangeRequests).mockReturnValue(true);
  vi.mocked(permissions.canApproveChangeRequests).mockReturnValue(true);
  vi.mocked(permissions.canPerformStructuralOperations).mockReturnValue(true);
});

describe('ChangeRequestDetailPage', () => {
  it('shows accessible loading state while change request is loading', () => {
    mockUseChangeRequest.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    expect(
      screen.getByRole('status', { name: /loading change request details/i }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('shows error alert with retry when loading fails', () => {
    const refetch = vi.fn();
    mockUseChangeRequest.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Not found'),
      refetch,
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/error loading change request/i);
  });

  it('renders request details section with status, type, rationale, requestor', () => {
    mockUseChangeRequest.mockReturnValue({
      data: stubCR,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    expect(screen.getByRole('region', { name: /request details/i })).toBeInTheDocument();
    expect(screen.getByText('Pending approval')).toBeInTheDocument();
    expect(screen.getByText('Update')).toBeInTheDocument();
    expect(
      screen.getByText('Clarify scope of Payment Processing capability'),
    ).toBeInTheDocument();
    // alice appears in both the "Requested by" field and the "Acting as" actions panel
    expect(screen.getAllByText('alice').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Minor scope clarification only.')).toBeInTheDocument();
    expect(
      screen.getByText('Notify downstream teams before publishing.'),
    ).toBeInTheDocument();
  });

  it('renders affected capabilities section with links', () => {
    mockUseChangeRequest.mockReturnValue({
      data: stubCR,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    const section = screen.getByRole('region', { name: /affected capabilities/i });
    expect(section).toBeInTheDocument();

    const links = screen.getAllByRole('link', { name: /cap-abc/i });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/capabilities/cap-abc-1');
    expect(links[1]).toHaveAttribute('href', '/capabilities/cap-abc-2');
  });

  it('renders approval decisions table with curator decision', () => {
    mockUseChangeRequest.mockReturnValue({
      data: stubCR,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    expect(screen.getByRole('region', { name: /approval decisions/i })).toBeInTheDocument();
    expect(screen.getByText('curator')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('Looks good.')).toBeInTheDocument();
  });

  it('renders audit trail timeline with event entries', () => {
    mockUseChangeRequest.mockReturnValue({
      data: stubCR,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    const auditSection = screen.getByRole('region', { name: /audit trail/i });
    expect(auditSection).toBeInTheDocument();

    // The timeline should contain entries (2 in the stub)
    const timeline = screen.getByRole('list', { name: /audit trail/i });
    expect(timeline.querySelectorAll('li')).toHaveLength(2);
  });

  it('shows approve and reject buttons for governance-board role in PENDING_APPROVAL status', () => {
    mockUseChangeRequest.mockReturnValue({
      data: stubCR,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
  });

  it('shows apply structural operation instead of mark complete for structural requests in EXECUTING state', () => {
    mockUseChangeRequest.mockReturnValue({
      data: {
        ...stubCR,
        type: ChangeRequestType.REPARENT,
        status: ChangeRequestStatus.EXECUTING,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    expect(
      screen.getByRole('button', { name: /apply structural operation/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /mark complete/i }),
    ).not.toBeInTheDocument();
  });

  it('shows execution status section with workflow progress when status is EXECUTING', () => {
    mockUseChangeRequest.mockReturnValue({
      data: {
        ...stubCR,
        type: ChangeRequestType.REPARENT,
        status: ChangeRequestStatus.EXECUTING,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    expect(screen.getByRole('region', { name: /execution status/i })).toBeInTheDocument();
    expect(screen.getByText(/execution in progress/i)).toBeInTheDocument();
    // Workflow progress steps
    expect(screen.getByRole('list', { name: /workflow progress/i })).toBeInTheDocument();
    expect(screen.getByText(/✓ Approved/)).toBeInTheDocument();
    expect(screen.getByText(/● Executing/)).toBeInTheDocument();
    expect(screen.getByText(/○ Complete/)).toBeInTheDocument();
  });

  it('shows structural operation description in execution status for structural request', () => {
    mockUseChangeRequest.mockReturnValue({
      data: {
        ...stubCR,
        type: ChangeRequestType.REPARENT,
        status: ChangeRequestStatus.EXECUTING,
        affectedCapabilityIds: ['cap-1', 'cap-2'],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    // Operation label and description (getByText finds it within the operation box)
    expect(screen.getAllByText(/Re-parent/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Move one or more capabilities to a new parent/i)).toBeInTheDocument();
    // Affected capability count
    expect(screen.getByText(/2 capabilities affected/i)).toBeInTheDocument();
    // Apply instruction (text is split by <strong> tag, check the surrounding text)
    expect(screen.getByText(/will immediately modify the capability hierarchy/i)).toBeInTheDocument();
  });

  it('shows mark complete (not apply) and non-structural description for non-structural EXECUTING request', () => {
    mockUseChangeRequest.mockReturnValue({
      data: {
        ...stubCR,
        type: ChangeRequestType.UPDATE,
        status: ChangeRequestStatus.EXECUTING,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apply structural operation/i })).not.toBeInTheDocument();
    expect(screen.getByText(/review the proposed changes/i)).toBeInTheDocument();
  });

  it('shows report failure button in execution status panel and toggles failure form', () => {
    mockUseChangeRequest.mockReturnValue({
      data: {
        ...stubCR,
        type: ChangeRequestType.REPARENT,
        status: ChangeRequestStatus.EXECUTING,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    const failBtn = screen.getByRole('button', { name: /report failure/i });
    expect(failBtn).toBeInTheDocument();

    fireEvent.click(failBtn);
    expect(screen.getByLabelText(/failure details/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm failure/i })).toBeInTheDocument();
  });

  it('hides the pre-execution actions panel when status is EXECUTING', () => {
    mockUseChangeRequest.mockReturnValue({
      data: {
        ...stubCR,
        type: ChangeRequestType.REPARENT,
        status: ChangeRequestStatus.EXECUTING,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    // The pre-execution Actions panel heading should NOT appear
    // (only the ExecutionStatusPanel heading "Execution in progress" should)
    expect(screen.queryByRole('heading', { name: /^actions$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/execution in progress/i)).toBeInTheDocument();
  });

  it('shows no action buttons for an identity with no role', () => {
    mockGetUserId.mockReturnValue('');
    mockGetUserRole.mockReturnValue('');

    mockUseChangeRequest.mockReturnValue({
      data: stubCR,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/set your identity in the banner/i),
    ).toBeInTheDocument();
  });

  it('shows back link to change requests list', () => {
    mockUseChangeRequest.mockReturnValue({
      data: stubCR,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequest>);

    renderPage();

    expect(
      screen.getByRole('link', { name: /back to change requests/i }),
    ).toHaveAttribute('href', '/change-requests');
  });
});
