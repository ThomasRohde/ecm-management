import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateWhatIfBranchInput } from '../../api/versioning';
import { CreateWhatIfBranchDialog } from './CreateWhatIfBranchDialog';
import type { CreateWhatIfBranchDialogProps } from './CreateWhatIfBranchDialog';

const defaultProps: CreateWhatIfBranchDialogProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
};

describe('CreateWhatIfBranchDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function renderDialog(props: Partial<CreateWhatIfBranchDialogProps> = {}) {
    return render(<CreateWhatIfBranchDialog {...defaultProps} {...props} />);
  }

  it('renders the "New what-if branch" heading', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /new what-if branch/i })).toBeInTheDocument();
  });

  it('renders the branch name input', () => {
    renderDialog();
    expect(screen.getByRole('textbox', { name: /branch name/i })).toBeInTheDocument();
  });

  it('renders the description textarea', () => {
    renderDialog();
    expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument();
  });

  it('shows a validation error when submitted with an empty branch name', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /create branch/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/branch name is required/i);
  });

  it('does not call onConfirm when submitted without a branch name', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: /create branch/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows a validation error for an invalid branch name format', () => {
    renderDialog();
    fireEvent.change(screen.getByRole('textbox', { name: /branch name/i }), {
      target: { value: 'Invalid Name With Spaces' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create branch/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/lowercase letters/i);
  });

  it('calls onConfirm with trimmed branchName when submitted with a valid name', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    fireEvent.change(screen.getByRole('textbox', { name: /branch name/i }), {
      target: { value: '  explore-ai-reskilling  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create branch/i }));
    expect(onConfirm).toHaveBeenCalledWith<[CreateWhatIfBranchInput]>(
      expect.objectContaining({ branchName: 'explore-ai-reskilling' }),
    );
  });

  it('includes description in onConfirm payload when provided', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    fireEvent.change(screen.getByRole('textbox', { name: /branch name/i }), {
      target: { value: 'ai-branch' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /description/i }), {
      target: { value: 'Testing AI capability changes' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create branch/i }));
    expect(onConfirm).toHaveBeenCalledWith<[CreateWhatIfBranchInput]>({
      branchName: 'ai-branch',
      description: 'Testing AI capability changes',
    });
  });

  it('omits description from payload when description is empty', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    fireEvent.change(screen.getByRole('textbox', { name: /branch name/i }), {
      target: { value: 'my-branch' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create branch/i }));
    const call = (onConfirm as ReturnType<typeof vi.fn>).mock.calls[0]![0] as CreateWhatIfBranchInput;
    expect(call.description).toBeUndefined();
  });

  it('calls onClose when the Cancel button is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables the submit button when isPending is true', () => {
    renderDialog({ isPending: true });
    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();
  });

  it('shows "Creating…" label while pending', () => {
    renderDialog({ isPending: true });
    expect(screen.getByText(/creating…/i)).toBeInTheDocument();
  });

  it('displays a server error message when errorMessage is provided', () => {
    renderDialog({ errorMessage: 'A branch with that name already exists.' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /a branch with that name already exists/i,
    );
  });

  it('mentions the analysis-only limitation in the dialog body', () => {
    renderDialog();
    expect(screen.getByText(/analysis only/i)).toBeInTheDocument();
  });

  it('traps focus within the dialog and restores focus to the trigger when closed', async () => {
    const user = userEvent.setup();

    function DialogHarness() {
      const [isOpen, setIsOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open dialog
          </button>
          <CreateWhatIfBranchDialog
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            onConfirm={vi.fn()}
          />
        </>
      );
    }

    render(<DialogHarness />);

    const openButton = screen.getByRole('button', { name: /open dialog/i });
    await user.click(openButton);

    const branchNameInput = await screen.findByRole('textbox', { name: /branch name/i });
    await waitFor(() => {
      expect(branchNameInput).toHaveFocus();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    cancelButton.focus();
    await user.tab();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close/i })).toHaveFocus();
    });

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    await waitFor(() => {
      expect(cancelButton).toHaveFocus();
    });

    await user.click(cancelButton);
    await waitFor(() => {
      expect(openButton).toHaveFocus();
    });
  });
});
