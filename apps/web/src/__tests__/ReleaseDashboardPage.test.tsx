import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelVersionStateEnum } from '@ecm/shared';
import { ReleaseDashboardPage } from '../pages/ReleaseDashboardPage';
import * as versioningApi from '../api/versioning';
import * as permissions from '../auth/permissions';

vi.mock('../api/versioning');
vi.mock('../auth/permissions');

const mockUseModelVersions = vi.mocked(versioningApi.useModelVersions);
const mockUseCurrentDraft = vi.mocked(versioningApi.useCurrentDraft);
const mockUseVersionDiff = vi.mocked(versioningApi.useVersionDiff);
const mockUsePublishModelVersion = vi.mocked(versioningApi.usePublishModelVersion);
const mockUseRollbackModelVersion = vi.mocked(versioningApi.useRollbackModelVersion);

// ─── Fixture data ─────────────────────────────────────────────────────────────

const stubDraft = {
  id: 'draft-1',
  versionLabel: 'DRAFT',
  state: ModelVersionStateEnum.DRAFT,
  baseVersionId: 'v1-id',
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

const stubPublished = {
  id: 'v1-id',
  versionLabel: 'v1.0.0',
  state: ModelVersionStateEnum.PUBLISHED,
  baseVersionId: null,
  branchType: 'MAIN' as const,
  branchName: null,
  description: 'First stable release',
  notes: null,
  createdBy: 'bob',
  approvedBy: 'carol',
  publishedAt: '2025-02-01T12:00:00.000Z',
  rollbackOfVersionId: null,
  createdAt: '2025-02-01T08:00:00.000Z',
  updatedAt: '2025-02-01T12:00:00.000Z',
};

const stubRolledBack = {
  ...stubPublished,
  id: 'v0-id',
  versionLabel: 'v0.9.0',
  state: ModelVersionStateEnum.ROLLED_BACK,
  publishedAt: '2025-01-01T12:00:00.000Z',
  createdAt: '2025-01-01T08:00:00.000Z',
  updatedAt: '2025-01-01T12:00:00.000Z',
};

const stubDiff = {
  fromVersion: { id: 'v1-id', versionLabel: 'v1.0.0', state: ModelVersionStateEnum.PUBLISHED },
  toVersion: { id: 'draft-1', versionLabel: 'DRAFT', state: ModelVersionStateEnum.DRAFT },
  added: [{ capabilityId: 'cap-new', name: 'New Capability', afterSnapshot: { uniqueName: 'New Capability' } }],
  modified: [{ capabilityId: 'cap-mod', name: 'Modified Cap', changedFields: { description: 'changed' } }],
  removed: [],
  summary: { addedCount: 1, modifiedCount: 1, removedCount: 0 },
};

// ─── Default mock setup ───────────────────────────────────────────────────────

function setupDefaultMocks() {
  mockUseModelVersions.mockReturnValue({
    data: { items: [stubDraft, stubPublished, stubRolledBack], total: 3 },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof versioningApi.useModelVersions>);

  mockUseCurrentDraft.mockReturnValue({
    data: stubDraft,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof versioningApi.useCurrentDraft>);

  mockUseVersionDiff.mockReturnValue({
    data: stubDiff,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof versioningApi.useVersionDiff>);

  mockUsePublishModelVersion.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof versioningApi.usePublishModelVersion>);

  mockUseRollbackModelVersion.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof versioningApi.useRollbackModelVersion>);

  // Mock permissions - default to allowing release management
  vi.mocked(permissions.canManageReleases).mockReturnValue(true);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReleaseDashboardPage />
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ReleaseDashboardPage', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /releases/i, level: 2 })).toBeInTheDocument();
  });

  it('shows accessible loading state while versions are loading', () => {
    mockUseModelVersions.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useModelVersions>);
    mockUseCurrentDraft.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useCurrentDraft>);

    renderPage();

    expect(
      screen.getByRole('status', { name: /loading release dashboard/i }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('shows error card with retry when versions fail to load', () => {
    const refetch = vi.fn();
    mockUseModelVersions.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
      refetch,
    } as unknown as ReturnType<typeof versioningApi.useModelVersions>);

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(/error loading releases/i);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('ReleaseDashboardPage – current draft section', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('shows the current draft heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /current draft/i, level: 3 })).toBeInTheDocument();
  });

  it('shows the current draft version label and state badge', () => {
    renderPage();
    // Draft section shows the state badge and the version label
    const draftSection = screen.getByRole('region', { name: /current draft/i });
    expect(draftSection).toHaveTextContent('DRAFT');
  });

  it('shows the draft creator', () => {
    renderPage();
    expect(screen.getByText(/created by/i)).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
  });

  it('shows "Publish draft…" button when draft is present', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /publish draft/i })).toBeInTheDocument();
  });

  it('shows no-draft message when no active draft', () => {
    mockUseCurrentDraft.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useCurrentDraft>);

    renderPage();

    expect(screen.getByText(/no active draft/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish draft/i })).not.toBeInTheDocument();
  });
});

describe('ReleaseDashboardPage – publish workflow', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('opens the publish form when "Publish draft…" is clicked', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /publish draft/i }));

    expect(screen.getByRole('form', { name: /publish release form/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/version label/i)).toBeInTheDocument();
  });

  it('closes the publish form when Cancel is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /publish draft/i }));
    expect(screen.getByRole('form', { name: /publish release form/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('form', { name: /publish release form/i })).not.toBeInTheDocument();
  });

  it('shows validation error when form is submitted without a version label', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /publish draft/i }));

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/version label is required/i);
  });

  it('calls publishMutation.mutate with correct data when form is submitted', () => {
    const mutate = vi.fn();
    mockUsePublishModelVersion.mockReturnValue({
      mutate,
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof versioningApi.usePublishModelVersion>);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /publish draft/i }));

    fireEvent.change(screen.getByLabelText(/version label/i), {
      target: { value: 'v2.0.0' },
    });

    const descInput = screen.getByLabelText(/description/i);
    fireEvent.change(descInput, { target: { value: 'Major release' } });

    // Confirm review before submitting
    fireEvent.click(screen.getByRole('checkbox', { name: /reviewed the changes/i }));

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ versionLabel: 'v2.0.0', description: 'Major release' }),
      expect.any(Object),
    );
  });

  it('shows "Publishing…" label while mutation is pending', () => {
    mockUsePublishModelVersion.mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
      error: null,
    } as unknown as ReturnType<typeof versioningApi.usePublishModelVersion>);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /publish draft/i }));

    // The publish button in the form should show pending label
    expect(screen.getByRole('button', { name: /publishing/i })).toBeDisabled();
  });
});

describe('ReleaseDashboardPage – version history', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('renders the version history section heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /version history/i, level: 3 })).toBeInTheDocument();
  });

  it('shows all versions in the history list', () => {
    renderPage();
    const rows = screen.getAllByTestId('version-history-row');
    expect(rows).toHaveLength(3);
  });

  it('shows version labels in the list', () => {
    renderPage();
    const historySection = screen.getByRole('region', { name: /version history/i });
    expect(historySection).toHaveTextContent('v1.0.0');
    expect(historySection).toHaveTextContent('v0.9.0');
  });

  it('shows "Rollback to this…" button only for published versions', () => {
    renderPage();
    const rollbackButtons = screen.getAllByRole('button', { name: /rollback to version/i });
    // Only the PUBLISHED version should have a rollback button (not the ROLLED_BACK one)
    expect(rollbackButtons).toHaveLength(1);
    expect(rollbackButtons[0]).toHaveAccessibleName(/rollback to version v1\.0\.0/i);
  });

  it('shows "No published versions yet" when history is empty', () => {
    mockUseModelVersions.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useModelVersions>);

    renderPage();
    expect(screen.getByText(/no published versions yet/i)).toBeInTheDocument();
  });
});

describe('ReleaseDashboardPage – rollback dialog', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('opens rollback dialog when "Rollback to this…" is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /rollback to version v1\.0\.0/i }));

    expect(screen.getByRole('heading', { name: /confirm rollback/i })).toBeInTheDocument();
  });

  it('shows the target version label in the rollback dialog', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /rollback to version v1\.0\.0/i }));

    expect(screen.getByRole('note')).toHaveTextContent('v1.0.0');
  });
});

describe('ReleaseDashboardPage – version comparison', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('renders the version comparison section when versions are available', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /version comparison/i, level: 3 })).toBeInTheDocument();
  });

  it('renders from/to version selects', () => {
    renderPage();
    expect(screen.getByLabelText(/comparison from version/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/comparison to version/i)).toBeInTheDocument();
  });

  it('renders diff summary when diff data is available', () => {
    renderPage();
    // The stub diff has 1 added and 1 modified capability
    expect(screen.getByText(/1 added/i)).toBeInTheDocument();
    expect(screen.getByText(/1 modified/i)).toBeInTheDocument();
  });

  it('shows "Loading version diff" status when diff is loading', () => {
    mockUseVersionDiff.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useVersionDiff>);

    renderPage();
    expect(screen.getByRole('status', { name: /loading version diff/i })).toBeInTheDocument();
  });

  it('shows diff error when diff query fails', () => {
    mockUseVersionDiff.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Diff unavailable'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useVersionDiff>);

    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load diff/i);
  });

  it('expands added capabilities bucket to show capability names', () => {
    renderPage();
    // Click "1 added" to expand
    const addedButton = screen.getByRole('button', { name: /1 added/i });
    fireEvent.click(addedButton);

    expect(screen.getByText('New Capability')).toBeInTheDocument();
  });
});

describe('ReleaseDashboardPage – publication context banner', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('shows "Draft pending" badge when a current draft exists', () => {
    renderPage();
    const banner = screen.getByLabelText(/publication status/i);
    expect(banner).toHaveTextContent(/Draft pending/i);
  });

  it('shows capability change count in the banner when diff is loaded', () => {
    renderPage();
    const banner = screen.getByLabelText(/publication status/i);
    // stubDiff has addedCount:1 + modifiedCount:1 + removedCount:0 = 2
    expect(banner).toHaveTextContent(/2 capability change/i);
  });

  it('shows "Published" badge and no-pending-draft message when there is no current draft', () => {
    mockUseCurrentDraft.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useCurrentDraft>);

    renderPage();

    const banner = screen.getByLabelText(/publication status/i);
    expect(banner).toHaveTextContent(/Model is fully published/i);
  });
});

describe('ReleaseDashboardPage – publish workflow – approval gate', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('renders the review acknowledgment checkbox in the publish form', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /publish draft/i }));
    expect(
      screen.getByRole('checkbox', { name: /reviewed the changes/i }),
    ).toBeInTheDocument();
  });

  it('renders the "Approved by" field in the publish form', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /publish draft/i }));
    expect(screen.getByLabelText(/approved by/i)).toBeInTheDocument();
  });

  it('shows a review error when submitting with a valid label but without confirming review', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /publish draft/i }));

    fireEvent.change(screen.getByLabelText(/version label/i), {
      target: { value: 'v3.0.0' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/confirm you have reviewed/i);
  });

  it('passes approvedBy to mutate when the field is filled and review is confirmed', () => {
    const mutate = vi.fn();
    mockUsePublishModelVersion.mockReturnValue({
      mutate,
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof versioningApi.usePublishModelVersion>);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /publish draft/i }));

    fireEvent.change(screen.getByLabelText(/version label/i), {
      target: { value: 'v3.0.0' },
    });
    fireEvent.change(screen.getByLabelText(/approved by/i), {
      target: { value: 'alice' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /reviewed the changes/i }));
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ versionLabel: 'v3.0.0', approvedBy: 'alice' }),
      expect.any(Object),
    );
  });
});
