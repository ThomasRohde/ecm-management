import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CapabilityType, LifecycleStatus } from '@ecm/shared';
import { CapabilityListPage } from '../pages/CapabilityListPage';
import * as capabilitiesApi from '../api/capabilities';
import * as changeRequestsApi from '../api/change-requests';

vi.mock('../api/capabilities');
vi.mock('../api/change-requests', async (importOriginal) => {
  const actual = await importOriginal<typeof changeRequestsApi>();
  return {
    ...actual,
    useChangeRequests: vi.fn(),
  };
});

const mockUseCapabilities = vi.mocked(capabilitiesApi.useCapabilities);
const mockUseChangeRequests = vi.mocked(changeRequestsApi.useChangeRequests);

const stubItems = [
  {
    id: 'cap-1',
    uniqueName: 'Customer Onboarding',
    description: 'Handles customer acquisition.',
    type: CapabilityType.ABSTRACT,
    lifecycleStatus: LifecycleStatus.ACTIVE,
    parentId: null,
  },
  {
    id: 'cap-2',
    uniqueName: 'KYC Verification',
    description: 'Know-your-customer checks.',
    type: CapabilityType.LEAF,
    lifecycleStatus: LifecycleStatus.ACTIVE,
    parentId: 'cap-1',
  },
];

function stubChangeRequests() {
  mockUseChangeRequests.mockReturnValue({
    data: { items: [], total: 0 },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof changeRequestsApi.useChangeRequests>);
}

function stubLoading() {
  mockUseCapabilities.mockReturnValue({
    data: undefined,
    isLoading: true,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);
}

function stubLoaded(
  items = stubItems,
  total = items.length,
) {
  mockUseCapabilities.mockReturnValue({
    data: { items, total, page: 1, limit: 20, totalPages: 1 },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);
}

function renderPage(initialSearch = '') {
  return render(
    <MemoryRouter initialEntries={[`/capabilities${initialSearch}`]}>
      <CapabilityListPage />
    </MemoryRouter>,
  );
}

describe('CapabilityListPage', () => {
  beforeEach(() => {
    stubChangeRequests();
  });

  describe('search input', () => {
    it('renders a labelled search input', () => {
      stubLoaded();
      renderPage();

      expect(screen.getByRole('searchbox', { name: /search/i })).toBeInTheDocument();
    });

    it('has a role="search" landmark wrapping search controls', () => {
      stubLoaded();
      renderPage();

      expect(
        screen.getByRole('search', { name: /search and filter capabilities/i }),
      ).toBeInTheDocument();
    });

    it('renders the leaf-only toggle button with aria-pressed', () => {
      stubLoaded();
      renderPage();

      const toggle = screen.getByRole('button', { name: /leaf capabilities only/i });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-pressed');
    });

    it('leaf toggle starts unpressed when no type param in URL', () => {
      stubLoaded();
      renderPage();

      expect(
        screen.getByRole('button', { name: /leaf capabilities only/i }),
      ).toHaveAttribute('aria-pressed', 'false');
    });

    it('renders capability type and lifecycle status filters', () => {
      stubLoaded();
      renderPage();

      expect(screen.getByLabelText(/capability type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/lifecycle status/i)).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows loading message while fetching', () => {
      stubLoading();
      renderPage();

      expect(
        screen.getByRole('status', { name: /loading capabilities/i }),
      ).toBeInTheDocument();
      expect(screen.getByText(/loading capabilities/i)).toBeInTheDocument();
    });

    it('loading state has aria-busy=true', () => {
      stubLoading();
      renderPage();

      const loading = screen.getByRole('status', { name: /loading capabilities/i });
      expect(loading).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('loaded state', () => {
    it('renders capability cards', () => {
      stubLoaded();
      renderPage();

      expect(screen.getByText('Customer Onboarding')).toBeInTheDocument();
      expect(screen.getByText('KYC Verification')).toBeInTheDocument();
    });

    it('shows result-count summary', () => {
      stubLoaded();
      renderPage();

      expect(screen.getByText(/2 capabilities found/i)).toBeInTheDocument();
    });

    it('shows singular form for exactly 1 result', () => {
      stubLoaded(stubItems.slice(0, 1), 1);
      renderPage();

      expect(screen.getByText('1 capability found')).toBeInTheDocument();
    });

    it('result-summary has aria-live=polite', () => {
      stubLoaded();
      renderPage();

      const summary = screen.getByText(/capabilities found/i);
      expect(summary).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('empty state', () => {
    it('shows generic empty-state message when no filters active', () => {
      stubLoaded([], 0);
      renderPage();

      expect(
        screen.getByText(/no capabilities found. create one to get started./i),
      ).toBeInTheDocument();
    });

    it('shows filter-specific empty message when search is active', () => {
      mockUseCapabilities.mockReturnValue({
        data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);

      renderPage('?search=zzznomatch');

      expect(
        screen.getByText(/no capabilities match your filters/i),
      ).toBeInTheDocument();
    });

    it('shows filter-specific empty message when structured filters are active', () => {
      mockUseCapabilities.mockReturnValue({
        data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);

      renderPage('?view=list&type=LEAF');

      expect(
        screen.getByText(/no capabilities match the current search or filters/i),
      ).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows an error alert when the API call fails', () => {
      mockUseCapabilities.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network timeout'),
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);

      renderPage();

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/error loading capabilities/i);
      expect(alert).toHaveTextContent('Network timeout');
    });

    it('offers a retry action when loading capabilities fails', () => {
      const refetch = vi.fn();
      mockUseCapabilities.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network timeout'),
        refetch,
      } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);

      renderPage();

      fireEvent.click(screen.getByRole('button', { name: /retry/i }));

      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('leaf toggle interaction', () => {
    it('clicking the toggle updates aria-pressed', () => {
      stubLoaded();
      renderPage();

      const toggle = screen.getByRole('button', { name: /leaf capabilities only/i });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(toggle);

      // After click the component re-renders with pressed state
      expect(
        screen.getByRole('button', { name: /leaf capabilities only/i }),
      ).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
