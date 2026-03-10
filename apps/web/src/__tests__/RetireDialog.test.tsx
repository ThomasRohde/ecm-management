import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeRequestType } from '@ecm/shared';
import { RetireDialog } from '../components/capability/RetireDialog';
import * as changeRequestsApi from '../api/change-requests';

vi.mock('../api/change-requests');

describe('RetireDialog', () => {
  const defaultProps = {
    capabilityId: 'cap-1',
    capabilityName: 'Legacy Payments',
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(changeRequestsApi.useCreateChangeRequest).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'cr-99' }),
      isPending: false,
    } as unknown as ReturnType<typeof changeRequestsApi.useCreateChangeRequest>);
  });

  function renderDialog(props: Partial<typeof defaultProps> = {}) {
    return render(
      <MemoryRouter>
        <RetireDialog {...defaultProps} {...props} />
      </MemoryRouter>,
    );
  }

  it('should render the retire capability heading', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /retire capability/i })).toBeInTheDocument();
  });

  it('should show the capability name in the warning', () => {
    renderDialog();
    expect(screen.getByText(/legacy payments/i)).toBeInTheDocument();
  });

  it('should show a rationale validation error when submitted without rationale', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /create change request/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/rationale is required/i);
  });

  it('should call onClose when cancel is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call createChangeRequest with RETIRE type and empty operationPayload when no date', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'cr-10' });
    const onSuccess = vi.fn();
    vi.mocked(changeRequestsApi.useCreateChangeRequest).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof changeRequestsApi.useCreateChangeRequest>);

    renderDialog({ onSuccess });
    fireEvent.change(screen.getByRole('textbox', { name: /rationale/i }), {
      target: { value: 'No longer in use' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create change request/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        type: ChangeRequestType.RETIRE,
        rationale: 'No longer in use',
        affectedCapabilityIds: ['cap-1'],
        operationPayload: {},
      });
      expect(onSuccess).toHaveBeenCalledWith('cr-10');
    });
  });

  it('should include effectiveTo in operationPayload when date is set', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'cr-11' });
    vi.mocked(changeRequestsApi.useCreateChangeRequest).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof changeRequestsApi.useCreateChangeRequest>);

    renderDialog();
    fireEvent.change(screen.getByRole('textbox', { name: /rationale/i }), {
      target: { value: 'Retiring' },
    });
    fireEvent.change(screen.getByLabelText(/effective date/i), {
      target: { value: '2025-12-31' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create change request/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          operationPayload: { effectiveTo: '2025-12-31' },
        }),
      );
    });
  });
});
