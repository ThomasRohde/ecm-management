import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MappingState } from '@ecm/shared';
import { EditMappingDialog } from './EditMappingDialog';
import type { EditMappingDialogProps } from './EditMappingDialog';
import type { MappingDisplayDto } from './mapping.types';

const mapping: MappingDisplayDto = {
  id: 'mapping-1',
  mappingType: 'CONSUMES',
  systemId: 'SYS-001',
  systemName: 'ERP Core',
  capabilityId: 'CAP-123',
  capabilityName: 'Data Exchange',
  state: MappingState.ACTIVE,
  attributes: {
    notes: 'Initial note',
  },
  createdAt: '2025-02-01T00:00:00.000Z',
  updatedAt: '2025-02-10T00:00:00.000Z',
};

const defaultProps: EditMappingDialogProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  mapping,
};

describe('EditMappingDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function renderDialog(props: Partial<EditMappingDialogProps> = {}) {
    return render(<EditMappingDialog {...defaultProps} {...props} />);
  }

  it('renders the "Edit mapping" heading', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /edit mapping/i })).toBeInTheDocument();
  });

  it('pre-populates form fields from the mapping prop', () => {
    renderDialog();
    expect(screen.getByRole('textbox', { name: /system name/i })).toHaveValue('ERP Core');
    expect(screen.getByRole('textbox', { name: /system id/i })).toHaveValue('SYS-001');
    expect(screen.getByRole('combobox', { name: /mapping type/i })).toHaveValue('CONSUMES');
    expect(screen.getByRole('combobox', { name: /state/i })).toHaveValue('ACTIVE');
    expect(screen.getByRole('textbox', { name: /notes/i })).toHaveValue('Initial note');
  });

  it('calls onConfirm with updated values', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });

    fireEvent.change(screen.getByRole('textbox', { name: /system name/i }), {
      target: { value: 'ERP Modernized' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /mapping type/i }), {
      target: { value: 'MANAGES' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /notes/i }), {
      target: { value: 'Updated note' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onConfirm).toHaveBeenCalledWith({
      systemId: 'SYS-001',
      systemName: 'ERP Modernized',
      mappingType: 'MANAGES',
      state: 'ACTIVE',
      notes: 'Updated note',
    });
  });

  it('shows a validation error when system name is cleared', () => {
    renderDialog();

    fireEvent.change(screen.getByRole('textbox', { name: /system name/i }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(screen.getByText(/system name is required/i)).toBeInTheDocument();
  });

  it('disables submit when isPending', () => {
    renderDialog({ isPending: true });
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });

  it('shows errorMessage when provided', () => {
    renderDialog({ errorMessage: 'Unable to save mapping.' });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to save mapping/i);
  });
});
