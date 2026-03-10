import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeRequestType } from '@ecm/shared';
import { ReparentDialog } from '../components/capability/ReparentDialog';
import * as capabilitiesApi from '../api/capabilities';
import * as changeRequestsApi from '../api/change-requests';

vi.mock('../api/capabilities');
vi.mock('../api/change-requests');

const emptyListResponse = { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };

describe('ReparentDialog', () => {
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
    vi.mocked(capabilitiesApi.useCapabilitySubtree).mockReturnValue({
      data: { id: 'cap-1', uniqueName: 'Payment Processing', children: [] } as unknown as ReturnType<typeof capabilitiesApi.useCapabilitySubtree>['data'],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof capabilitiesApi.useCapabilitySubtree>);
    vi.mocked(changeRequestsApi.useCreateChangeRequest).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'cr-123' }),
      isPending: false,
    } as unknown as ReturnType<typeof changeRequestsApi.useCreateChangeRequest>);
  });

  function renderDialog(props: Partial<typeof defaultProps> = {}) {
    return render(
      <MemoryRouter>
        <ReparentDialog {...defaultProps} {...props} />
      </MemoryRouter>,
    );
  }

  it('should render the move capability heading', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /move capability/i })).toBeInTheDocument();
  });

  it('should display the capability name being moved', () => {
    renderDialog();
    expect(screen.getByText('Payment Processing')).toBeInTheDocument();
  });

  it('should have the submit button disabled initially', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /create change request/i })).toBeDisabled();
  });

  it('should enable submit after selecting root level', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /move to root level/i }));
    expect(screen.getByRole('button', { name: /create change request/i })).not.toBeDisabled();
  });

  it('should call onClose when cancel is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should show a rationale validation error when submitted without rationale', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /move to root level/i }));
    fireEvent.click(screen.getByRole('button', { name: /create change request/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/rationale is required/i);
  });

  it('should call createChangeRequest with REPARENT and null newParentId for root level', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'cr-42' });
    const onSuccess = vi.fn();
    vi.mocked(changeRequestsApi.useCreateChangeRequest).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof changeRequestsApi.useCreateChangeRequest>);

    renderDialog({ onSuccess });
    fireEvent.click(screen.getByRole('button', { name: /move to root level/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /rationale/i }), {
      target: { value: 'Restructuring hierarchy' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create change request/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        type: ChangeRequestType.REPARENT,
        rationale: 'Restructuring hierarchy',
        affectedCapabilityIds: ['cap-1'],
        operationPayload: { newParentId: null },
      });
      expect(onSuccess).toHaveBeenCalledWith('cr-42');
    });
  });
});
