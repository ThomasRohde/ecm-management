import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchType, ModelVersionStateEnum } from '@ecm/shared';
import type { ModelVersion } from '@ecm/shared';
import { WhatIfManagerPage } from '../pages/WhatIfManagerPage';
import * as versioningApi from '../api/versioning';
import * as permissions from '../auth/permissions';

vi.mock('../api/versioning');
vi.mock('../auth/permissions');

const mockUseWhatIfBranches = vi.mocked(versioningApi.useWhatIfBranches);
const mockUseWhatIfBranchDiff = vi.mocked(versioningApi.useWhatIfBranchDiff);
const mockUseCreateWhatIfBranch = vi.mocked(versioningApi.useCreateWhatIfBranch);
const mockUseDiscardWhatIfBranch = vi.mocked(versioningApi.useDiscardWhatIfBranch);

// ─── Stubs ────────────────────────────────────────────────────────────────────

function makeVersion(overrides: Partial<ModelVersion> = {}): ModelVersion {
  return {
    id: 'branch-1',
    versionLabel: 'branch-draft',
    state: ModelVersionStateEnum.DRAFT,
    baseVersionId: 'mv-base',
    branchType: BranchType.WHAT_IF,
    branchName: 'explore-ai-reskilling',
    description: 'Testing AI capability changes',
    notes: null,
    createdBy: 'alice',
    approvedBy: null,
    publishedAt: null,
    rollbackOfVersionId: null,
    createdAt: '2025-01-15T10:00:00.000Z',
    updatedAt: '2025-01-15T10:00:00.000Z',
    ...overrides,
  };
}

const stubMutateFn = vi.fn();

const idleMutation = {
  mutate: stubMutateFn,
  isPending: false,
  isSuccess: false,
  isError: false,
  error: null,
  data: undefined,
  reset: vi.fn(),
} as unknown as ReturnType<typeof versioningApi.useCreateWhatIfBranch>;

// ─── Render helper ────────────────────────────────────────────────────────────

function renderPage(initialPath = '/what-if') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/what-if" element={<WhatIfManagerPage />} />
        <Route path="/what-if/:branchId" element={<WhatIfManagerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WhatIfManagerPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Default: idle mutations
    mockUseCreateWhatIfBranch.mockReturnValue(idleMutation);
    mockUseDiscardWhatIfBranch.mockReturnValue(idleMutation as unknown as ReturnType<typeof versioningApi.useDiscardWhatIfBranch>);
    mockUseWhatIfBranchDiff.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranchDiff>);

    // Mock permissions - default to allowing what-if branch management
    vi.mocked(permissions.canManageWhatIfBranches).mockReturnValue(true);
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows an accessible loading state while branches are loading', () => {
    mockUseWhatIfBranches.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranches>);

    renderPage();

    expect(
      screen.getByRole('status', { name: /loading what-if branches/i }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows an error alert with a retry button when loading fails', () => {
    const refetch = vi.fn();
    mockUseWhatIfBranches.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Connection refused'),
      refetch,
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranches>);

    renderPage();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/error loading branches/i);
    expect(alert).toHaveTextContent('Connection refused');

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('shows the empty state message when no branches exist', () => {
    mockUseWhatIfBranches.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranches>);

    renderPage();

    expect(screen.getByText(/no what-if branches/i)).toBeInTheDocument();
  });

  // ── List rendering ─────────────────────────────────────────────────────────

  it('renders branch cards with name, description, creator, and action buttons', () => {
    const branch = makeVersion();
    mockUseWhatIfBranches.mockReturnValue({
      data: { items: [branch], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranches>);

    renderPage();

    expect(screen.getByText('explore-ai-reskilling')).toBeInTheDocument();
    expect(screen.getByText('Testing AI capability changes')).toBeInTheDocument();
    expect(screen.getByText(/alice/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view diff/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard branch explore-ai-reskilling/i })).toBeInTheDocument();
  });

  it('shows the correct branch count label', () => {
    const branch = makeVersion();
    mockUseWhatIfBranches.mockReturnValue({
      data: { items: [branch], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranches>);

    renderPage();

    expect(screen.getByText(/1 active branch/i)).toBeInTheDocument();
  });

  it('shows plural branch count for multiple branches', () => {
    const branches = [makeVersion(), makeVersion({ id: 'branch-2', branchName: 'other-branch' })];
    mockUseWhatIfBranches.mockReturnValue({
      data: { items: branches, total: 2 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranches>);

    renderPage();

    expect(screen.getByText(/2 active branches/i)).toBeInTheDocument();
  });

  // ── Analysis-only notice ───────────────────────────────────────────────────

  it('always shows the analysis-only notice', () => {
    mockUseWhatIfBranches.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranches>);

    renderPage();

    expect(screen.getByRole('note', { name: /analysis-only notice/i })).toBeInTheDocument();
    expect(screen.getByText(/OQ-3/)).toBeInTheDocument();
  });

  // ── Create dialog ──────────────────────────────────────────────────────────

  it('opens the create dialog when "New branch" header button is clicked', () => {
    mockUseWhatIfBranches.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranches>);

    renderPage();

    const newBranchButtons = screen.getAllByRole('button', { name: /new branch/i });
    fireEvent.click(newBranchButtons[0]!);
    expect(screen.getByRole('heading', { name: /new what-if branch/i })).toBeInTheDocument();
  });

  it('opens the create dialog from the empty state button', () => {
    mockUseWhatIfBranches.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranches>);

    renderPage();

    // Both the header and empty-state buttons open the same dialog
    const newBranchButtons = screen.getAllByRole('button', { name: /new branch/i });
    expect(newBranchButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(newBranchButtons[newBranchButtons.length - 1]!);
    expect(screen.getByRole('heading', { name: /new what-if branch/i })).toBeInTheDocument();
  });

  // ── Discard dialog ─────────────────────────────────────────────────────────

  it('opens the discard dialog when the Discard button is clicked', () => {
    const branch = makeVersion();
    mockUseWhatIfBranches.mockReturnValue({
      data: { items: [branch], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranches>);

    renderPage();

    fireEvent.click(
      screen.getByRole('button', { name: /discard branch explore-ai-reskilling/i }),
    );
    expect(screen.getByRole('heading', { name: /discard branch/i })).toBeInTheDocument();
    // Branch name appears in the dialog body (in addition to the branch card)
    const nameMatches = screen.getAllByText(/explore-ai-reskilling/);
    expect(nameMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('closes the discard dialog when Cancel is clicked', () => {
    const branch = makeVersion();
    mockUseWhatIfBranches.mockReturnValue({
      data: { items: [branch], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranches>);

    renderPage();

    fireEvent.click(
      screen.getByRole('button', { name: /discard branch explore-ai-reskilling/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('heading', { name: /discard branch/i })).not.toBeInTheDocument();
  });

  // ── Page heading ───────────────────────────────────────────────────────────

  it('renders the page heading "What-if branches"', () => {
    mockUseWhatIfBranches.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof versioningApi.useWhatIfBranches>);

    renderPage();

    expect(screen.getByRole('heading', { name: /what-if branches/i, level: 2 })).toBeInTheDocument();
  });
});
