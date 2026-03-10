import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilityVersionChangeType } from '@ecm/shared';
import type { CapabilityVersion } from '@ecm/shared';
import { RollbackConfirmDialog } from './RollbackConfirmDialog';
import type { RollbackConfirmDialogProps } from './RollbackConfirmDialog';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  targetVersionLabel: 'v2.1.0',
  currentVersionLabel: 'v3.0.0',
};

const mockCapabilityVersion: CapabilityVersion = {
  id: 'cv-1',
  capabilityId: 'cap-1',
  modelVersionId: 'mv-1',
  changeType: CapabilityVersionChangeType.RENAME,
  changedFields: { uniqueName: {} },
  beforeSnapshot: { uniqueName: 'Old Name' },
  afterSnapshot: { uniqueName: 'New Name' },
  changedBy: 'alice',
  changedAt: '2024-01-15T10:00:00Z',
  previousVersionId: null,
};

describe('RollbackConfirmDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function renderDialog(props: Partial<RollbackConfirmDialogProps> = {}) {
    return render(<RollbackConfirmDialog {...defaultProps} {...props} />);
  }

  it('should render the "Confirm rollback" heading', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /confirm rollback/i })).toBeInTheDocument();
  });

  it('should display the target version label in the warning', () => {
    renderDialog();
    expect(screen.getByText(/v2\.1\.0/)).toBeInTheDocument();
  });

  it('should display the current version label in the warning', () => {
    renderDialog();
    expect(screen.getByText(/v3\.0\.0/)).toBeInTheDocument();
  });

  it('should render the rollback rationale textarea', () => {
    renderDialog();
    expect(screen.getByRole('textbox', { name: /rollback rationale/i })).toBeInTheDocument();
  });

  it('should show a validation error when submitted with an empty rationale', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /confirm rollback/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/rollback rationale is required/i);
  });

  it('should not call onConfirm when submitted without rationale', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: /confirm rollback/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('should call onConfirm with trimmed notes when submitted with valid input', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    fireEvent.change(screen.getByRole('textbox', { name: /rollback rationale/i }), {
      target: { value: '  Reverting bad changes  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm rollback/i }));
    expect(onConfirm).toHaveBeenCalledWith('Reverting bad changes');
  });

  it('should call onClose when the Cancel button is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when the × button is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should disable the confirm button when isPending is true', () => {
    renderDialog({ isPending: true });
    expect(screen.getByRole('button', { name: /rolling back/i })).toBeDisabled();
  });

  it('should show "Rolling back…" label while pending', () => {
    renderDialog({ isPending: true });
    expect(screen.getByText(/rolling back…/i)).toBeInTheDocument();
  });

  describe('diff preview', () => {
    it('should not render the diff toggle when previewEntries is not provided', () => {
      renderDialog();
      expect(screen.queryByRole('button', { name: /show affected capabilities/i })).not.toBeInTheDocument();
    });

    it('should render the diff toggle when previewEntries are provided', () => {
      renderDialog({ previewEntries: [mockCapabilityVersion] });
      expect(
        screen.getByRole('button', { name: /show affected capabilities/i }),
      ).toBeInTheDocument();
    });

    it('should not show the diff content initially', () => {
      renderDialog({ previewEntries: [mockCapabilityVersion] });
      expect(screen.queryByText('Renamed')).not.toBeInTheDocument();
    });

    it('should reveal diff content when the toggle is clicked', () => {
      renderDialog({ previewEntries: [mockCapabilityVersion] });
      fireEvent.click(screen.getByRole('button', { name: /show affected capabilities/i }));
      expect(screen.getByText('Renamed')).toBeInTheDocument();
    });

    it('should collapse diff content on second toggle click', () => {
      renderDialog({ previewEntries: [mockCapabilityVersion] });
      const toggle = screen.getByRole('button', { name: /show affected capabilities/i });
      fireEvent.click(toggle);
      fireEvent.click(toggle);
      expect(screen.queryByText('Renamed')).not.toBeInTheDocument();
    });
  });
});
