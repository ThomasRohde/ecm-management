import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LifecycleStatus } from '@ecm/shared';
import { GuardrailReviewQueuePage } from '../pages/GuardrailReviewQueuePage';
import * as capabilitiesApi from '../api/capabilities';

vi.mock('../api/capabilities');

const mockUseFlaggedCapabilities = vi.mocked(capabilitiesApi.useFlaggedCapabilities);

const stubItem = {
  id: 'cap-flagged-1',
  uniqueName: 'Slack Collaboration Workflow',
  lifecycleStatus: LifecycleStatus.ACTIVE,
  domain: 'Collaboration',
  stewardId: 'steward-123',
  stewardDepartment: 'Enterprise Architecture',
  updatedAt: '2025-02-03T12:30:00.000Z',
  nameGuardrailOverride: true,
  nameGuardrailOverrideRationale: 'Steward-approved vendor terminology is required for this workflow.',
  matchedTerms: ['slack', 'workflow'],
  warningMessage: 'Capability name matches blocked terms and requires review.',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/guardrails/review-queue']}>
      <GuardrailReviewQueuePage />
    </MemoryRouter>,
  );
}

describe('GuardrailReviewQueuePage', () => {
  it('shows an accessible loading state while the queue is loading', () => {
    mockUseFlaggedCapabilities.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useFlaggedCapabilities>);

    renderPage();

    expect(
      screen.getByRole('status', { name: /loading guardrail review queue/i }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an empty state when no flagged capabilities are returned', () => {
    mockUseFlaggedCapabilities.mockReturnValue({
      data: {
        items: [],
        page: 1,
        limit: 25,
        hasMore: false,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useFlaggedCapabilities>);

    renderPage();

    expect(
      screen.getByRole('heading', { level: 3, name: /no flagged capabilities/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/capability names that match the guardrail blocklist will appear here/i),
    ).toBeInTheDocument();
  });

  it('renders matched terms, override state, and rationale for flagged capabilities', () => {
    mockUseFlaggedCapabilities.mockReturnValue({
      data: {
        items: [stubItem],
        page: 1,
        limit: 25,
        hasMore: false,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useFlaggedCapabilities>);

    renderPage();

    expect(screen.getByText(/1 flagged capability requires review/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open capability slack collaboration workflow/i }))
      .toHaveAttribute('href', '/capabilities/cap-flagged-1');
    expect(screen.getByText('Override recorded')).toBeInTheDocument();
    expect(screen.getByText('slack')).toBeInTheDocument();
    expect(screen.getByText('workflow')).toBeInTheDocument();
    expect(
      screen.getByText(/steward-approved vendor terminology is required/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/capability name matches blocked terms and requires review/i),
    ).toBeInTheDocument();
  });

  it('shows retry feedback when the queue request fails', () => {
    const refetch = vi.fn();
    mockUseFlaggedCapabilities.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network timeout'),
      refetch,
    } as unknown as ReturnType<typeof capabilitiesApi.useFlaggedCapabilities>);

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(/error loading guardrail review queue/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    screen.getByRole('button', { name: /retry/i }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows when a flagged capability still needs rationale', () => {
    mockUseFlaggedCapabilities.mockReturnValue({
        data: {
          items: [
            {
              ...stubItem,
              id: 'cap-flagged-2',
              nameGuardrailOverride: false,
              nameGuardrailOverrideRationale: null,
            },
          ],
          page: 1,
          limit: 25,
          hasMore: false,
        },
        isLoading: false,
        error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useFlaggedCapabilities>);

    renderPage();

    expect(screen.getByText('Override pending')).toBeInTheDocument();
    expect(screen.getByText(/no rationale recorded/i)).toBeInTheDocument();
  });
});
