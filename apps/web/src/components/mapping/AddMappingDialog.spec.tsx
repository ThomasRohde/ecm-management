import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddMappingDialog } from './AddMappingDialog';
import type { AddMappingDialogProps } from './AddMappingDialog';

const defaultProps: AddMappingDialogProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  capabilityId: 'CAP-100',
  capabilityName: 'Data Exchange',
};

describe('AddMappingDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function renderDialog(props: Partial<AddMappingDialogProps> = {}) {
    return render(<AddMappingDialog {...defaultProps} {...props} />);
  }

  it('renders the "Add mapping" heading', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /add mapping/i })).toBeInTheDocument();
  });

  it('shows a validation error when system name is empty', () => {
    renderDialog();
    fireEvent.change(screen.getByRole('textbox', { name: /system id/i }), {
      target: { value: 'SYS-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add mapping/i }));
    expect(screen.getByText(/system name is required/i)).toBeInTheDocument();
  });

  it('shows a validation error when system ID is empty', () => {
    renderDialog();
    fireEvent.change(screen.getByRole('textbox', { name: /system name/i }), {
      target: { value: 'ERP Core' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add mapping/i }));
    expect(screen.getByText(/system id is required/i)).toBeInTheDocument();
  });

  it('does not call onConfirm when validation fails', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: /add mapping/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm with correct values when form is valid', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });

    fireEvent.change(screen.getByRole('textbox', { name: /system name/i }), {
      target: { value: '  ERP Core  ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /system id/i }), {
      target: { value: '  SYS-001  ' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /mapping type/i }), {
      target: { value: 'MANAGES' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /state/i }), {
      target: { value: 'ACTIVE' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /notes/i }), {
      target: { value: '  Important dependency  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add mapping/i }));

    expect(onConfirm).toHaveBeenCalledWith({
      systemId: 'SYS-001',
      systemName: 'ERP Core',
      mappingType: 'MANAGES',
      state: 'ACTIVE',
      notes: 'Important dependency',
    });
  });

  it('disables submit button when isPending is true', () => {
    renderDialog({ isPending: true });
    expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled();
  });

  it('shows "Adding…" label when isPending', () => {
    renderDialog({ isPending: true });
    expect(screen.getByText(/adding…/i)).toBeInTheDocument();
  });

  it('displays errorMessage when provided', () => {
    renderDialog({ errorMessage: 'Duplicate mapping detected.' });
    expect(screen.getByRole('alert')).toHaveTextContent(/duplicate mapping detected/i);
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when × button is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
