import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscardBranchConfirmDialog } from './DiscardBranchConfirmDialog';
import type { DiscardBranchConfirmDialogProps } from './DiscardBranchConfirmDialog';

const defaultProps: DiscardBranchConfirmDialogProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  branchName: 'explore-ai-reskilling',
};

describe('DiscardBranchConfirmDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function renderDialog(props: Partial<DiscardBranchConfirmDialogProps> = {}) {
    return render(<DiscardBranchConfirmDialog {...defaultProps} {...props} />);
  }

  it('renders the "Discard branch" heading', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /discard branch/i })).toBeInTheDocument();
  });

  it('displays the branch name in the confirmation text', () => {
    renderDialog();
    expect(screen.getByText(/explore-ai-reskilling/)).toBeInTheDocument();
  });

  it('shows a warning that the main model is not affected', () => {
    renderDialog();
    expect(screen.getByText(/main model is not affected/i)).toBeInTheDocument();
  });

  it('shows a warning that the action cannot be undone', () => {
    renderDialog();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: /discard branch/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
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

  it('disables the confirm button when isPending is true', () => {
    renderDialog({ isPending: true });
    expect(screen.getByRole('button', { name: /discarding/i })).toBeDisabled();
  });

  it('shows "Discarding…" label while pending', () => {
    renderDialog({ isPending: true });
    expect(screen.getByText(/discarding…/i)).toBeInTheDocument();
  });

  it('disables the cancel button when isPending is true', () => {
    renderDialog({ isPending: true });
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });
});
