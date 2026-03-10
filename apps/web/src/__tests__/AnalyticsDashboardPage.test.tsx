import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsDashboardPage } from '../pages/AnalyticsDashboardPage';
import * as analyticsApi from '../api/analytics';
import * as exportsApi from '../api/exports';
import * as AuthContext from '../contexts/AuthContext';

vi.mock('../api/analytics');
vi.mock('../api/exports');
vi.mock('../contexts/AuthContext');

// ─── Typed mocks ──────────────────────────────────────────────────────────────

const mockUseModelHealth = vi.mocked(analyticsApi.useModelHealth);
const mockUseGapAnalysis = vi.mocked(analyticsApi.useGapAnalysis);
const mockUseRecentActivity = vi.mocked(analyticsApi.useRecentActivity);
const mockUseAuth = vi.mocked(AuthContext.useAuth);
const mockDownloadCsv = vi.mocked(exportsApi.downloadCapabilitiesCsv);
const mockDownloadJson = vi.mocked(exportsApi.downloadCurrentModelJson);

// ─── Fixture data ─────────────────────────────────────────────────────────────

const stubHealth = {
  totalCapabilities: 120,
  totalLeafCapabilities: 80,
  totalMappings: 45,
  mappedCapabilities: 60,
  mappedLeafCapabilities: 60,
  lifecycleStatusCounts: { DRAFT: 10, ACTIVE: 95, DEPRECATED: 12, RETIRED: 3 } as Record<string, number>,
  capabilityTypeCounts: { ABSTRACT: 40, LEAF: 80 } as Record<string, number>,
  domainBreakdown: [
    {
      domain: 'Payments',
      capabilityCount: 30,
      leafCapabilityCount: 20,
      mappedCapabilityCount: 15,
      mappedLeafCapabilityCount: 15,
      stewardshipCoverageCount: 25,
      lifecycleStatusCounts: {} as Record<string, number>,
      capabilityTypeCounts: {} as Record<string, number>,
    },
  ],
  stewardshipCoverage: { covered: 95, total: 120, percentage: 79.2 },
  mappingCoverage: { covered: 60, total: 80, percentage: 75 },
};

const stubGap = {
  summary: {
    unmappedActiveLeafCapabilityCount: 2,
    deprecatedCapabilitiesWithActiveMappingsCount: 1,
  },
  appliedFilters: { domain: null, limit: 20 },
  unmappedActiveLeafCapabilities: [
    {
      id: 'cap-1',
      uniqueName: 'Payment Initiation',
      domain: 'Payments',
      lifecycleStatus: 'ACTIVE' as const,
      stewardId: 'alice',
      stewardDepartment: 'Payments Team',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'cap-2',
      uniqueName: 'KYC Verification',
      domain: null,
      lifecycleStatus: 'ACTIVE' as const,
      stewardId: null,
      stewardDepartment: null,
      updatedAt: '2025-01-02T00:00:00.000Z',
    },
  ],
  deprecatedCapabilitiesWithActiveMappings: [
    {
      id: 'cap-3',
      uniqueName: 'Legacy Auth',
      domain: 'Identity',
      lifecycleStatus: 'DEPRECATED' as const,
      stewardId: 'bob',
      stewardDepartment: 'Identity Team',
      updatedAt: '2025-01-03T00:00:00.000Z',
      activeMappingCount: 3,
      systems: ['SystemA', 'SystemB'],
    },
  ],
};

const stubActivity = {
  items: [
    {
      id: 'evt-1',
      entityType: 'CAPABILITY' as const,
      entityId: 'cap-1',
      action: 'CREATE' as const,
      actorId: 'alice',
      occurredAt: '2025-03-01T10:00:00.000Z',
      summary: 'Created capability Payment Initiation',
    },
    {
      id: 'evt-2',
      entityType: 'MAPPING' as const,
      entityId: 'map-1',
      action: 'UPDATE' as const,
      actorId: 'bob',
      occurredAt: '2025-03-01T09:00:00.000Z',
      summary: 'Updated mapping for SystemA',
    },
  ],
  totalReturned: 2,
};

// ─── Default mock helpers ─────────────────────────────────────────────────────

function setupAuthenticatedMocks() {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    hasRole: vi.fn().mockReturnValue(false),
    hasAnyRole: vi.fn().mockReturnValue(false),
  });

  mockUseModelHealth.mockReturnValue({
    data: { data: stubHealth, meta: { generatedAt: '2025-03-10T08:00:00.000Z' } },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof analyticsApi.useModelHealth>);

  mockUseGapAnalysis.mockReturnValue({
    data: { data: stubGap, meta: { generatedAt: '2025-03-10T08:00:00.000Z' } },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof analyticsApi.useGapAnalysis>);

  mockUseRecentActivity.mockReturnValue({
    data: { data: stubActivity, meta: { generatedAt: '2025-03-10T08:00:00.000Z' } },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof analyticsApi.useRecentActivity>);

  mockDownloadCsv.mockResolvedValue(undefined);
  mockDownloadJson.mockResolvedValue(undefined);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AnalyticsDashboardPage />
    </MemoryRouter>,
  );
}

// ─── Auth gate ────────────────────────────────────────────────────────────────

describe('AnalyticsDashboardPage – auth gate', () => {
  it('shows sign-in card when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasRole: vi.fn().mockReturnValue(false),
      hasAnyRole: vi.fn().mockReturnValue(false),
    });

    // All queries need stubbed return values even when disabled
    mockUseModelHealth.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof analyticsApi.useModelHealth>);
    mockUseGapAnalysis.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof analyticsApi.useGapAnalysis>);
    mockUseRecentActivity.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof analyticsApi.useRecentActivity>);

    renderPage();

    expect(screen.getByText(/sign in to view analytics/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/analytics/i, { selector: 'h2' })).not.toBeInTheDocument();
  });

  it('shows loading skeleton while auth is initializing', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasRole: vi.fn().mockReturnValue(false),
      hasAnyRole: vi.fn().mockReturnValue(false),
    });
    mockUseModelHealth.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof analyticsApi.useModelHealth>);
    mockUseGapAnalysis.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof analyticsApi.useGapAnalysis>);
    mockUseRecentActivity.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof analyticsApi.useRecentActivity>);

    renderPage();

    expect(
      screen.getByRole('status', { name: /loading analytics dashboard/i }),
    ).toHaveAttribute('aria-busy', 'true');
  });
});

// ─── Loading states ───────────────────────────────────────────────────────────

describe('AnalyticsDashboardPage – loading states', () => {
  beforeEach(() => {
    setupAuthenticatedMocks();
  });

  it('shows loading skeleton when model health is loading', () => {
    mockUseModelHealth.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof analyticsApi.useModelHealth>);

    renderPage();

    expect(
      screen.getByRole('status', { name: /loading analytics dashboard/i }),
    ).toHaveAttribute('aria-busy', 'true');
  });
});

// ─── Error states ─────────────────────────────────────────────────────────────

describe('AnalyticsDashboardPage – error states', () => {
  beforeEach(() => {
    setupAuthenticatedMocks();
  });

  it('shows error card with retry when model health fails', () => {
    const refetch = vi.fn();
    mockUseModelHealth.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
      refetch,
    } as unknown as ReturnType<typeof analyticsApi.useModelHealth>);

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(/error loading dashboard/i);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows gap analysis error with retry when gap query fails', () => {
    const refetch = vi.fn();
    mockUseGapAnalysis.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Gap analysis error'),
      refetch,
    } as unknown as ReturnType<typeof analyticsApi.useGapAnalysis>);

    renderPage();

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((el) => /error loading gap analysis/i.test(el.textContent ?? ''))).toBe(true);
  });

  it('shows recent activity error with retry when activity query fails', () => {
    const refetch = vi.fn();
    mockUseRecentActivity.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Activity error'),
      refetch,
    } as unknown as ReturnType<typeof analyticsApi.useRecentActivity>);

    renderPage();

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((el) => /error loading recent activity/i.test(el.textContent ?? ''))).toBe(true);
  });
});

// ─── Summary cards ────────────────────────────────────────────────────────────

describe('AnalyticsDashboardPage – summary cards', () => {
  beforeEach(() => {
    setupAuthenticatedMocks();
  });

  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /analytics/i, level: 2 })).toBeInTheDocument();
  });

  it('shows total capabilities summary card', () => {
    renderPage();
    const card = screen.getByTestId('summary-card-capabilities');
    expect(card).toHaveTextContent('120');
  });

  it('shows mapping coverage percentage in summary card', () => {
    renderPage();
    const card = screen.getByTestId('summary-card-mapping');
    expect(card).toHaveTextContent('75%');
  });

  it('shows stewardship coverage percentage in summary card', () => {
    renderPage();
    const card = screen.getByTestId('summary-card-stewardship');
    expect(card).toHaveTextContent('79%');
  });

  it('shows total mappings count', () => {
    renderPage();
    const card = screen.getByTestId('summary-card-mappings-total');
    expect(card).toHaveTextContent('45');
  });
});

// ─── Gap analysis section ─────────────────────────────────────────────────────

describe('AnalyticsDashboardPage – gap analysis', () => {
  beforeEach(() => {
    setupAuthenticatedMocks();
  });

  it('renders the gap analysis section heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /gap analysis/i, level: 3 })).toBeInTheDocument();
  });

  it('shows unmapped capability names', () => {
    renderPage();
    expect(screen.getByText('Payment Initiation')).toBeInTheDocument();
    expect(screen.getByText('KYC Verification')).toBeInTheDocument();
  });

  it('shows "No steward" badge for capabilities without a steward', () => {
    renderPage();
    expect(screen.getByText('No steward')).toBeInTheDocument();
  });

  it('shows deprecated capabilities with active mapping count', () => {
    renderPage();
    expect(screen.getByText('Legacy Auth')).toBeInTheDocument();
    expect(screen.getByText(/3 active mappings/i)).toBeInTheDocument();
  });

  it('shows systems for deprecated capabilities', () => {
    renderPage();
    expect(screen.getByText(/SystemA, SystemB/)).toBeInTheDocument();
  });

  it('shows empty message when no unmapped capabilities', () => {
    mockUseGapAnalysis.mockReturnValue({
      data: {
        data: {
          ...stubGap,
          summary: { unmappedActiveLeafCapabilityCount: 0, deprecatedCapabilitiesWithActiveMappingsCount: 0 },
          unmappedActiveLeafCapabilities: [],
          deprecatedCapabilitiesWithActiveMappings: [],
        },
        meta: { generatedAt: '2025-03-10T08:00:00.000Z' },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof analyticsApi.useGapAnalysis>);

    renderPage();

    expect(screen.getByText(/no unmapped active leaf capabilities/i)).toBeInTheDocument();
    expect(screen.getByText(/no deprecated capabilities with active mappings/i)).toBeInTheDocument();
  });
});

// ─── Recent activity section ──────────────────────────────────────────────────

describe('AnalyticsDashboardPage – recent activity', () => {
  beforeEach(() => {
    setupAuthenticatedMocks();
  });

  it('renders the recent activity section heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /recent activity/i, level: 3 })).toBeInTheDocument();
  });

  it('shows activity item summaries', () => {
    renderPage();
    expect(screen.getByText('Created capability Payment Initiation')).toBeInTheDocument();
    expect(screen.getByText('Updated mapping for SystemA')).toBeInTheDocument();
  });

  it('shows actor and entity type for each activity item', () => {
    renderPage();
    const list = screen.getByRole('list', { name: /recent activity/i });
    expect(list).toHaveTextContent('alice');
    expect(list).toHaveTextContent('Capability');
    expect(list).toHaveTextContent('Mapping');
  });

  it('shows empty message when no activity', () => {
    mockUseRecentActivity.mockReturnValue({
      data: { data: { items: [], totalReturned: 0 }, meta: { generatedAt: '2025-03-10T08:00:00.000Z' } },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof analyticsApi.useRecentActivity>);

    renderPage();

    expect(screen.getByText(/no recent activity to display/i)).toBeInTheDocument();
  });
});

// ─── Export section ───────────────────────────────────────────────────────────

describe('AnalyticsDashboardPage – export section', () => {
  beforeEach(() => {
    setupAuthenticatedMocks();
  });

  it('renders the export section heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /export data/i, level: 3 })).toBeInTheDocument();
  });

  it('renders CSV and JSON download buttons', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /download csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download json/i })).toBeInTheDocument();
  });

  it('calls downloadCapabilitiesCsv when CSV button is clicked', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /download csv/i }));
    await waitFor(() => {
      expect(mockDownloadCsv).toHaveBeenCalledTimes(1);
    });
  });

  it('calls downloadCurrentModelJson when JSON button is clicked', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /download json/i }));
    await waitFor(() => {
      expect(mockDownloadJson).toHaveBeenCalledTimes(1);
    });
  });

  it('shows "Exporting…" label while CSV export is pending', async () => {
    let resolveFn!: () => void;
    mockDownloadCsv.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFn = resolve;
        }),
    );

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /download csv/i }));

    expect(await screen.findByRole('button', { name: /exporting/i })).toBeDisabled();

    await act(async () => {
      resolveFn();
    });
  });

  it('shows error message when CSV export fails', async () => {
    mockDownloadCsv.mockRejectedValue(new Error('Export failed'));

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /download csv/i }));

    await waitFor(() => {
      expect(screen.getByText(/export failed/i)).toBeInTheDocument();
    });
  });
});

// ─── Coverage by domain ───────────────────────────────────────────────────────

describe('AnalyticsDashboardPage – coverage by domain', () => {
  beforeEach(() => {
    setupAuthenticatedMocks();
  });

  it('renders the coverage by domain section when domain data is present', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /coverage by domain/i, level: 3 })).toBeInTheDocument();
  });

  it('shows domain names in coverage breakdown', () => {
    renderPage();
    const section = screen.getByRole('heading', { name: /coverage by domain/i }).closest('section');
    expect(section).toHaveTextContent('Payments');
  });
});
