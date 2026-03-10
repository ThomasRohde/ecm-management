import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeRequestType } from '@ecm/shared';
import { MergeDialog } from '../components/capability/MergeDialog';
import * as capabilitiesApi from '../api/capabilities';
import * as changeRequestsApi from '../api/change-requests';

vi.mock('../api/capabilities');
vi.mock('../api/change-requests');

const emptyListResponse = { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };
const otherCap = {
  id: 'cap-2',
  uniqueName: 'Risk Analytics',
  type: 'LEAF' as const,
  lifecycleStatus: 'ACTIVE' as const,
  parentId: null,
  description: null,
};

describe('MergeDialog', () => {
  const defaultProps = {
    capabilityId: 'cap-1',
    capabilityName: 'Payment Processing',
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(capabilitiesApi.useCapabilities).mockReturnValue({
      data: emptyListResponse,
      isLoading: false,
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);
    vi.mocked(changeRequestsApi.useCreateChangeRequest).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'cr-123' }),
      isPending: false,
    } as unknown as ReturnType<typeof changeRequestsApi.useCreateChangeRequest>);
  });

  function renderDialog(props: Partial<typeof defaultProps> = {}) {
    return render(
      <MemoryRouter>
        <MergeDialog {...defaultProps} {...props} />
      </MemoryRouter>,
    );
  }

  it('should render the merge capability heading', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /merge capability/i })).toBeInTheDocument();
  });

  it('should display the capability name being merged', () => {
    renderDialog();
    expect(screen.getByText('Payment Processing')).toBeInTheDocument();
  });

  it('should disable submit until another capability is selected', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /create change request/i })).toBeDisabled();
  });

  it('should call onClose when cancel is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should show survivor radio buttons after selecting other capability', async () => {
    vi.mocked(capabilitiesApi.useCapabilities).mockReturnValue({
      data: { items: [otherCap], total: 1, page: 1, limit: 10, totalPages: 1 },
      isLoading: false,
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);

    renderDialog();

    fireEvent.change(screen.getByRole('textbox', { name: /search.*capability/i }), {
      target: { value: 'Risk' },
    });

    const result = await screen.findByText('Risk Analytics');
    fireEvent.click(result);

    expect(screen.getByRole('radio', { name: /payment processing/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /risk analytics/i })).toBeInTheDocument();
  });

  it('should call createChangeRequest with MERGE type and current capability as default survivor', async () => {
    vi.mocked(capabilitiesApi.useCapabilities).mockReturnValue({
      data: { items: [otherCap], total: 1, page: 1, limit: 10, totalPages: 1 },
      isLoading: false,
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilities>);

    const mutateAsync = vi.fn().mockResolvedValue({ id: 'cr-55' });
    const onSuccess = vi.fn();
    vi.mocked(changeRequestsApi.useCreateChangeRequest).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof changeRequestsApi.useCreateChangeRequest>);

    renderDialog({ onSuccess });
    fireEvent.change(screen.getByRole('textbox', { name: /search.*capability/i }), {
      target: { value: 'Risk' },
    });
    fireEvent.click(await screen.findByText('Risk Analytics'));
    fireEvent.change(screen.getByRole('textbox', { name: /rationale/i }), {
      target: { value: 'Consolidating overlapping capabilities' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create change request/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        type: ChangeRequestType.MERGE,
        rationale: 'Consolidating overlapping capabilities',
        affectedCapabilityIds: ['cap-1', 'cap-2'],
        operationPayload: { survivorCapabilityId: 'cap-1' },
      });
      expect(onSuccess).toHaveBeenCalledWith('cr-55');
    });
  });
});
