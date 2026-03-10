import { CapabilityType, ChangeRequestStatus, ChangeRequestType, LifecycleStatus } from '@ecm/shared';
import { ModelVersionStateEnum } from '@ecm/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilityDetailPage } from '../pages/CapabilityDetailPage';
import * as capabilitiesApi from '../api/capabilities';
import * as changeRequestsApi from '../api/change-requests';
import * as versioningApi from '../api/versioning';
import * as permissions from '../auth/permissions';

vi.mock('../api/capabilities');
vi.mock('../api/change-requests');
vi.mock('../api/versioning');
vi.mock('../auth/permissions');
vi.mock('../api/mappings', () => ({
  useCapabilityMappings: vi.fn(() => ({ data: [], isLoading: false, error: null, refetch: vi.fn() })),
  useCreateMapping: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateMapping: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteMapping: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  toMappingDisplayDto: vi.fn((m: unknown, name: string) => ({ ...(m as object), systemName: '', capabilityName: name })),
  mappingFormValuesToCreateInput: vi.fn((v: unknown) => v),
  mappingFormValuesToUpdateInput: vi.fn((v: unknown) => v),
}));

const mockUseCapability = vi.mocked(capabilitiesApi.useCapability);
const mockUseCapabilityStewardship = vi.mocked(capabilitiesApi.useCapabilityStewardship);
const mockUseCapabilityBreadcrumbs = vi.mocked(capabilitiesApi.useCapabilityBreadcrumbs);
const mockUseCapabilityLeaves = vi.mocked(capabilitiesApi.useCapabilityLeaves);
const mockUseCapabilitySubtree = vi.mocked(capabilitiesApi.useCapabilitySubtree);
const mockUseCapabilities = vi.mocked(capabilitiesApi.useCapabilities);
const mockUseDeleteCapability = vi.mocked(capabilitiesApi.useDeleteCapability);

const stubCapability = {
  id: 'cap-1',
  uniqueName: 'Customer Onboarding',
  description: 'Handles customer acquisition.',
  rationale: 'Improves growth outcomes.',
  type: CapabilityType.ABSTRACT,
  lifecycleStatus: LifecycleStatus.ACTIVE,
  parentId: 'parent-1',
  parent: {
    id: 'parent-1',
    uniqueName: 'Customer Management',
  },
  children: [],
  aliases: [],
  tags: [],
  sourceReferences: [],
  stewardId: null,
  stewardDepartment: null,
  effectiveFrom: null,
  effectiveTo: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/capabilities/cap-1']}>
      <Routes>
        <Route path="/capabilities/:id" element={<CapabilityDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CapabilityDetailPage', () => {
  beforeEach(() => {
    mockUseCapabilities.mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 10, totalPages: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);

    vi.mocked(changeRequestsApi.useCapabilityChangeRequests).mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useCapabilityChangeRequests>);

    vi.mocked(changeRequestsApi.useCreateChangeRequest).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'cr-test' }),
      isPending: false,
    } as unknown as ReturnType<typeof changeRequestsApi.useCreateChangeRequest>);

    mockUseDeleteCapability.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof capabilitiesApi.useDeleteCapability>);

    mockUseCapabilityBreadcrumbs.mockReturnValue({
      data: [
        { id: 'parent-1', uniqueName: 'Customer Management' },
        { id: 'cap-1', uniqueName: 'Customer Onboarding' },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityBreadcrumbs>);

    mockUseCapabilitySubtree.mockReturnValue({
      data: {
        ...stubCapability,
        children: [],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilitySubtree>);

    mockUseCapabilityLeaves.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityLeaves>);

    mockUseCapabilityStewardship.mockReturnValue({
      data: {
        capabilityId: 'cap-1',
        stewardId: null,
        stewardDepartment: null,
        source: 'UNASSIGNED',
        sourceCapabilityId: null,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityStewardship>);

    vi.mocked(versioningApi.useCapabilityHistory).mockReturnValue({
      data: { items: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useCapabilityHistory>);

    vi.mocked(versioningApi.useCurrentDraft).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useCurrentDraft>);
    
    // Mock permissions - default to allowing all operations for these tests
    vi.mocked(permissions.canEditCapabilityMetadata).mockReturnValue(true);
    vi.mocked(permissions.canPerformStructuralOperations).mockReturnValue(true);
    vi.mocked(permissions.canDeleteCapability).mockReturnValue(true);
    vi.mocked(permissions.canManageMappings).mockReturnValue(true);
  });

  it('shows an accessible loading state while capability details are loading', () => {
    mockUseCapability.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapability>);

    renderPage();

    expect(
      screen.getByRole('status', { name: /loading capability details/i }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an error alert with retry action when loading fails', () => {
    const refetch = vi.fn();
    mockUseCapability.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Timeout'),
      refetch,
    } as unknown as ReturnType<typeof capabilitiesApi.useCapability>);

    renderPage();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/error loading capability/i);
    expect(alert).toHaveTextContent('Timeout');

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows inherited stewardship with a source capability link', () => {
    mockUseCapability.mockReturnValue({
      data: stubCapability,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapability>);

    mockUseCapabilityStewardship.mockReturnValue({
      data: {
        capabilityId: 'cap-1',
        stewardId: 'steward-42',
        stewardDepartment: 'Enterprise Architecture',
        source: 'INHERITED',
        sourceCapabilityId: 'parent-1',
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityStewardship>);

    renderPage();

    expect(screen.getByText('Inherited')).toBeInTheDocument();
    expect(screen.getByText('steward-42')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /inherited from customer management/i }),
    ).toHaveAttribute('href', '/capabilities/parent-1');
    expect(
      screen.getByText(/stewardship is inherited from an ancestor capability/i),
    ).toBeInTheDocument();
  });

  it('shows direct stewardship assignment when present on the capability', () => {
    mockUseCapability.mockReturnValue({
      data: {
        ...stubCapability,
        stewardId: 'steward-7',
        stewardDepartment: 'Operations',
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapability>);

    mockUseCapabilityStewardship.mockReturnValue({
      data: {
        capabilityId: 'cap-1',
        stewardId: 'steward-7',
        stewardDepartment: 'Operations',
        source: 'DIRECT',
        sourceCapabilityId: 'cap-1',
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityStewardship>);

    renderPage();

    expect(screen.getByText('Direct assignment')).toBeInTheDocument();
    expect(screen.getAllByText('steward-7')).toHaveLength(2);
    expect(screen.getByText('Assigned on this capability')).toBeInTheDocument();
  });

  it('shows unassigned stewardship clearly when no direct or inherited steward exists', () => {
    mockUseCapability.mockReturnValue({
      data: stubCapability,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapability>);

    renderPage();

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('No direct steward on this capability')).toBeInTheDocument();
    expect(screen.getAllByText('Not assigned')).toHaveLength(2);
    expect(
      screen.getByRole('link', { name: /manage stewardship/i }),
    ).toHaveAttribute('href', '/capabilities/cap-1/edit');
  });

  it('should show Move to…, Merge…, and Retire… buttons for a non-retired capability', () => {
    mockUseCapability.mockReturnValue({
      data: stubCapability,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapability>);

    renderPage();

    expect(screen.getByRole('button', { name: /move customer onboarding/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /merge customer onboarding/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retire customer onboarding/i })).toBeInTheDocument();
  });

  it('should disable structural operation buttons for a retired capability', () => {
    mockUseCapability.mockReturnValue({
      data: { ...stubCapability, lifecycleStatus: LifecycleStatus.RETIRED },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapability>);

    renderPage();

    expect(screen.getByRole('button', { name: /move customer onboarding/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /merge customer onboarding/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /retire customer onboarding/i })).toBeDisabled();
  });
});

describe('CapabilityDetailPage – active change request indicators', () => {
  const stubActiveCR = {
    id: 'cr-1',
    type: ChangeRequestType.UPDATE,
    status: ChangeRequestStatus.PENDING_APPROVAL,
    requestedBy: 'alice',
    rationale: 'Clarify scope of Customer Onboarding',
    affectedCapabilityIds: ['cap-1'],
    operationPayload: null,
    impactSummary: null,
    downstreamPlan: null,
    approvalDecisions: [],
    auditEntries: [],
    createdAt: '2025-01-20T08:00:00.000Z',
    updatedAt: '2025-01-20T09:00:00.000Z',
  };

  function renderPageWithCapability(crItems = [stubActiveCR]) {
    vi.mocked(capabilitiesApi.useCapabilities).mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 10, totalPages: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);

    vi.mocked(changeRequestsApi.useCapabilityChangeRequests).mockReturnValue({
      data: { items: crItems, total: crItems.length },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useCapabilityChangeRequests>);

    vi.mocked(changeRequestsApi.useCreateChangeRequest).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'cr-test' }),
      isPending: false,
    } as unknown as ReturnType<typeof changeRequestsApi.useCreateChangeRequest>);

    vi.mocked(capabilitiesApi.useDeleteCapability).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof capabilitiesApi.useDeleteCapability>);

    vi.mocked(capabilitiesApi.useCapabilityBreadcrumbs).mockReturnValue({
      data: [{ id: 'cap-1', uniqueName: 'Customer Onboarding' }],
      isLoading: false,
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityBreadcrumbs>);

    vi.mocked(capabilitiesApi.useCapabilitySubtree).mockReturnValue({
      data: { ...stubCapability, children: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilitySubtree>);

    vi.mocked(capabilitiesApi.useCapabilityLeaves).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityLeaves>);

    vi.mocked(capabilitiesApi.useCapabilityStewardship).mockReturnValue({
      data: {
        capabilityId: 'cap-1',
        stewardId: null,
        stewardDepartment: null,
        source: 'UNASSIGNED',
        sourceCapabilityId: null,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityStewardship>);

    vi.mocked(capabilitiesApi.useCapability).mockReturnValue({
      data: stubCapability,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapability>);

    vi.mocked(versioningApi.useCapabilityHistory).mockReturnValue({
      data: { items: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useCapabilityHistory>);

    vi.mocked(versioningApi.useCurrentDraft).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useCurrentDraft>);

    return render(
      <MemoryRouter initialEntries={['/capabilities/cap-1']}>
        <Routes>
          <Route path="/capabilities/:id" element={<CapabilityDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows active change requests note when capability has in-flight CRs', () => {
    renderPageWithCapability();

    const note = screen.getByRole('note', { name: /active change requests/i });
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(/1 in-flight change request/i);
  });

  it('links each active CR to its detail page', () => {
    renderPageWithCapability();

    const link = screen.getByRole('link', { name: /clarify scope of customer onboarding/i });
    expect(link).toHaveAttribute('href', '/change-requests/cr-1');
  });

  it('shows plural label when multiple in-flight CRs affect the capability', () => {
    const secondCR = {
      ...stubActiveCR,
      id: 'cr-2',
      rationale: 'Second CR affecting Customer Onboarding',
      status: ChangeRequestStatus.SUBMITTED,
    };

    renderPageWithCapability([stubActiveCR, secondCR]);

    const note = screen.getByRole('note', { name: /active change requests/i });
    expect(note).toHaveTextContent(/2 in-flight change requests/i);
  });

  it('does not show active change request section when no in-flight CRs exist', () => {
    renderPageWithCapability([]);

    expect(
      screen.queryByRole('note', { name: /active change requests/i }),
    ).not.toBeInTheDocument();
  });

  it('shows status badge for each active CR', () => {
    renderPageWithCapability();

    // The status badge should show "Pending approval" for PENDING_APPROVAL status
    expect(screen.getByText('Pending approval')).toBeInTheDocument();
  });
});

// ─── Minimal model draft fixture ──────────────────────────────────────────────

const stubModelDraft = {
  id: 'draft-1',
  versionLabel: 'DRAFT',
  state: ModelVersionStateEnum.DRAFT,
  baseVersionId: null,
  branchType: 'MAIN' as const,
  branchName: null,
  description: null,
  notes: null,
  createdBy: 'alice',
  approvedBy: null,
  publishedAt: null,
  rollbackOfVersionId: null,
  createdAt: '2025-03-01T10:00:00.000Z',
  updatedAt: '2025-03-01T10:00:00.000Z',
};

describe('CapabilityDetailPage – publication status', () => {
  type DraftQueryResult = ReturnType<typeof versioningApi.useCurrentDraft>;

  function renderWithPublicationState(
    draftData: typeof stubModelDraft | null,
    draftQueryOverride?: DraftQueryResult,
  ) {
    vi.mocked(capabilitiesApi.useCapabilities).mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 10, totalPages: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);

    vi.mocked(changeRequestsApi.useCapabilityChangeRequests).mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changeRequestsApi.useCapabilityChangeRequests>);

    vi.mocked(changeRequestsApi.useCreateChangeRequest).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'cr-test' }),
      isPending: false,
    } as unknown as ReturnType<typeof changeRequestsApi.useCreateChangeRequest>);

    vi.mocked(capabilitiesApi.useDeleteCapability).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof capabilitiesApi.useDeleteCapability>);

    mockUseCapabilityBreadcrumbs.mockReturnValue({
      data: [{ id: 'cap-1', uniqueName: 'Customer Onboarding' }],
      isLoading: false,
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityBreadcrumbs>);

    mockUseCapabilitySubtree.mockReturnValue({
      data: { ...stubCapability, children: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilitySubtree>);

    mockUseCapabilityLeaves.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityLeaves>);

    mockUseCapabilityStewardship.mockReturnValue({
      data: {
        capabilityId: 'cap-1',
        stewardId: null,
        stewardDepartment: null,
        source: 'UNASSIGNED',
        sourceCapabilityId: null,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityStewardship>);

    mockUseCapability.mockReturnValue({
      data: stubCapability,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapability>);

    vi.mocked(versioningApi.useCapabilityHistory).mockReturnValue({
      data: { items: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useCapabilityHistory>);

    vi.mocked(versioningApi.useCurrentDraft).mockReturnValue(
      draftQueryOverride ?? ({
        data: draftData,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as DraftQueryResult),
    );

    return render(
      <MemoryRouter initialEntries={['/capabilities/cap-1']}>
        <Routes>
          <Route path="/capabilities/:id" element={<CapabilityDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows "Viewing current draft" badge when a draft is active', () => {
    renderWithPublicationState(stubModelDraft);

    const statusBanner = screen.getByLabelText(/model publication status/i);
    expect(statusBanner).toHaveTextContent(/Viewing current draft/i);
    expect(statusBanner).toHaveTextContent(/current unpublished draft/i);
  });

  it('shows "Published" badge when no draft is active', () => {
    renderWithPublicationState(null);

    const statusBanner = screen.getByLabelText(/model publication status/i);
    expect(statusBanner).toHaveTextContent(/Published/i);
    expect(statusBanner).toHaveTextContent(/currently published model/i);
  });

  it('does not show the publication status banner when the draft query errors', () => {
    renderWithPublicationState(
      null,
      {
        data: undefined,
        isLoading: false,
        error: new Error('API unavailable'),
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof versioningApi.useCurrentDraft>,
    );

    expect(screen.queryByLabelText(/model publication status/i)).not.toBeInTheDocument();
  });
});
