import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CapabilityImportFormat, CapabilityType, LifecycleStatus } from '@ecm/shared';
import type {
  CapabilityImportCommitResult,
  CapabilityImportDryRunResult,
} from '@ecm/shared';
import { MemoryRouter } from 'react-router-dom';
import { CapabilityImportPage } from './CapabilityImportPage';
import * as permissions from '../auth/permissions';
import * as authContext from '../contexts/AuthContext';

const mockDryRunMutateAsync = vi.fn();
const mockCommitMutateAsync = vi.fn();

vi.mock('../auth/permissions', () => ({
  canImportCapabilities: vi.fn(() => true),
  getPermissionDeniedMessage: vi.fn(() => 'You do not have permission to import capabilities.'),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    isLoading: false,
  })),
}));

vi.mock('../api/capability-import', () => ({
  CAPABILITY_IMPORT_MAX_CONTENT_LENGTH: 200_000,
  useDryRunCapabilityImport: vi.fn(() => ({
    mutateAsync: mockDryRunMutateAsync,
    isPending: false,
  })),
  useCommitCapabilityImport: vi.fn(() => ({
    mutateAsync: mockCommitMutateAsync,
    isPending: false,
  })),
}));

function createDryRunResult(overrides: Partial<CapabilityImportDryRunResult> = {}): CapabilityImportDryRunResult {
  return {
    format: CapabilityImportFormat.CSV,
    supportedColumns: [
      {
        name: 'uniqueName',
        required: true,
        multiValue: false,
        description: 'Globally unique capability name.',
      },
      {
        name: 'aliases',
        required: false,
        multiValue: true,
        description: 'Optional pipe-delimited aliases.',
      },
    ],
    multiValueDelimiter: '|',
    canCommit: true,
    summary: {
      totalRows: 2,
      readyCount: 2,
      invalidRows: 0,
      createdCount: 0,
    },
    rows: [
      {
        rowNumber: 2,
        uniqueName: 'Finance',
        parentUniqueName: null,
        action: 'CREATE',
        type: CapabilityType.ABSTRACT,
        lifecycleStatus: LifecycleStatus.DRAFT,
      },
      {
        rowNumber: 3,
        uniqueName: 'Payments',
        parentUniqueName: 'Finance',
        action: 'CREATE',
        type: CapabilityType.LEAF,
        lifecycleStatus: LifecycleStatus.ACTIVE,
      },
    ],
    errors: [],
    warnings: [
      {
        rowNumber: 3,
        field: 'uniqueName',
        code: 'CAPABILITY_NAME_GUARDRAIL',
        message: 'Name matched a guardrail term.',
        matchedTerms: ['payments'],
        overrideApplied: false,
        overrideRationale: null,
      },
    ],
    ...overrides,
  };
}

function createCommitResult(): CapabilityImportCommitResult {
  return {
    ...createDryRunResult(),
    importId: 'import-42',
    summary: {
      totalRows: 2,
      readyCount: 2,
      invalidRows: 0,
      createdCount: 2,
    },
    created: [
      {
        rowNumber: 2,
        capabilityId: 'cap-finance',
        uniqueName: 'Finance',
        parentUniqueName: null,
      },
      {
        rowNumber: 3,
        capabilityId: 'cap-payments',
        uniqueName: 'Payments',
        parentUniqueName: 'Finance',
      },
    ],
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CapabilityImportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CapabilityImportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(permissions.canImportCapabilities).mockReturnValue(true);
    vi.mocked(authContext.useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasRole: vi.fn(),
      hasAnyRole: vi.fn(),
    });
  });

  it('shows a sign-in prompt when the user is not authenticated', () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasRole: vi.fn(),
      hasAnyRole: vi.fn(),
    });

    renderPage();

    expect(screen.getByText(/sign in required/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to the login page/i })).toBeInTheDocument();
  });

  it('shows an insufficient permissions message when import access is denied', () => {
    vi.mocked(permissions.canImportCapabilities).mockReturnValue(false);

    renderPage();

    expect(screen.getByText(/insufficient permissions/i)).toBeInTheDocument();
    expect(screen.getByText(/import capabilities/i)).toBeInTheDocument();
  });

  it('walks through the import wizard and renders the completion summary', async () => {
    const user = userEvent.setup();
    const csvContent = 'uniqueName,parentUniqueName\nFinance,\nPayments,Finance';
    mockDryRunMutateAsync.mockResolvedValue(createDryRunResult());
    mockCommitMutateAsync.mockResolvedValue(createCommitResult());

    renderPage();

    await user.type(screen.getByLabelText(/csv content/i), csvContent);
    await user.click(screen.getByRole('button', { name: /continue to review/i }));

    expect(screen.getByText(/review fixed import contract/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /run dry-run/i }));

    await waitFor(() => {
      expect(mockDryRunMutateAsync).toHaveBeenCalledWith({
        format: CapabilityImportFormat.CSV,
        csvContent,
      });
    });

    expect(await screen.findByText(/dry-run results/i)).toBeInTheDocument();
    expect(screen.getByText(/supported columns/i)).toBeInTheDocument();
    expect(screen.getByText(/name matched a guardrail term/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /continue to confirm/i }));
    await user.click(screen.getByRole('button', { name: /commit import/i }));

    await waitFor(() => {
      expect(mockCommitMutateAsync).toHaveBeenCalledWith({
        format: CapabilityImportFormat.CSV,
        csvContent,
      });
    });

    expect(await screen.findByText(/import completed/i)).toBeInTheDocument();
    expect(screen.getAllByText(/import-42/i)).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Finance' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Payments' })).toBeInTheDocument();
  });

  it('renders validation errors and blocks commit continuation when dry-run fails', async () => {
    const user = userEvent.setup();
    mockDryRunMutateAsync.mockResolvedValue(
      createDryRunResult({
        canCommit: false,
        summary: {
          totalRows: 1,
          readyCount: 0,
          invalidRows: 1,
          createdCount: 0,
        },
        errors: [
          {
            rowNumber: 2,
            field: 'uniqueName',
            code: 'EXISTING_CONFLICT',
            message:
              'Capability name "Payments" already exists. This import slice is create-only.',
          },
        ],
        warnings: [],
        rows: [
          {
            rowNumber: 2,
            uniqueName: 'Payments',
            parentUniqueName: null,
            action: 'CREATE',
            type: CapabilityType.LEAF,
            lifecycleStatus: LifecycleStatus.DRAFT,
          },
        ],
      }),
    );

    renderPage();

    await user.type(screen.getByLabelText(/csv content/i), 'uniqueName\nPayments');
    await user.click(screen.getByRole('button', { name: /continue to review/i }));
    await user.click(screen.getByRole('button', { name: /run dry-run/i }));

    expect(
      await screen.findByText(/Capability name "Payments" already exists/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue to confirm/i })).not.toBeInTheDocument();
  });
});
