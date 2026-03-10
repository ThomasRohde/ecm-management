import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CapabilityType, LifecycleStatus } from '@ecm/shared';
import {
  CapabilityForm,
  createCapabilityFormInitialValues,
  type CapabilityFormParentOption,
} from './CapabilityForm';

const parentOptions: CapabilityFormParentOption[] = [
  { id: 'parent-1', uniqueName: 'Customer Management' },
  { id: 'parent-2', uniqueName: 'Payments' },
];

function renderCapabilityForm(
  overrides?: Partial<ComponentProps<typeof CapabilityForm>>,
) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const onParentSearchChange = vi.fn();

  render(
    <CapabilityForm
      mode="create"
      initialValues={createCapabilityFormInitialValues()}
      parentOptions={parentOptions}
      parentSearch=""
      onParentSearchChange={onParentSearchChange}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitMessages={[]}
      {...overrides}
    />,
  );

  return {
    onSubmit,
    onCancel,
    onParentSearchChange,
  };
}

describe('CapabilityForm', () => {
  it('should show a validation message when the capability name is missing', () => {
    const { onSubmit } = renderCapabilityForm({
      initialValues: createCapabilityFormInitialValues({
        uniqueName: '',
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: /create capability/i }));

    expect(
      screen.getByText('Capability name is required.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('should normalize create input before submitting', () => {
    const { onSubmit, onParentSearchChange } = renderCapabilityForm();

    fireEvent.change(screen.getByLabelText(/Capability name/i), {
      target: { value: ' Payments Processing ' },
    });
    fireEvent.change(screen.getByLabelText(/Capability type/i), {
      target: { value: CapabilityType.LEAF },
    });
    fireEvent.change(screen.getByLabelText(/Lifecycle status/i), {
      target: { value: LifecycleStatus.ACTIVE },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'Coordinates end-to-end payment settlement.' },
    });
    fireEvent.change(screen.getByLabelText(/Search potential parent/i), {
      target: { value: 'Payments' },
    });
    fireEvent.change(screen.getByLabelText(/Parent capability/i), {
      target: { value: 'parent-2' },
    });
    fireEvent.change(screen.getByLabelText(/Steward ID/i), {
      target: { value: ' steward-1 ' },
    });
    fireEvent.change(screen.getByLabelText(/Steward department/i), {
      target: { value: 'Operations' },
    });
    fireEvent.change(screen.getByLabelText(/Effective from/i), {
      target: { value: '2025-01-01' },
    });
    fireEvent.change(screen.getByLabelText(/Effective to/i), {
      target: { value: '2025-12-31' },
    });
    fireEvent.change(screen.getByLabelText(/Domain/i), {
      target: { value: 'Finance' },
    });
    fireEvent.change(screen.getByLabelText(/Tags/i), {
      target: { value: 'payments, critical' },
    });
    fireEvent.change(screen.getByLabelText(/Aliases/i), {
      target: { value: 'Settlement, Clearing' },
    });
    fireEvent.change(screen.getByLabelText(/Rationale/i), {
      target: { value: 'Supports the phase 2B capability slice.' },
    });
    fireEvent.change(screen.getByLabelText(/Source references/i), {
      target: { value: 'https://example.com/reference\nConfluence page' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create capability/i }));

    expect(onParentSearchChange).toHaveBeenCalledWith('Payments');
    expect(onSubmit).toHaveBeenCalledWith({
      uniqueName: 'Payments Processing',
      description: 'Coordinates end-to-end payment settlement.',
      type: CapabilityType.LEAF,
      lifecycleStatus: LifecycleStatus.ACTIVE,
      parentId: 'parent-2',
      domain: 'Finance',
      aliases: ['Settlement', 'Clearing'],
      tags: ['payments', 'critical'],
      effectiveFrom: '2025-01-01',
      effectiveTo: '2025-12-31',
      rationale: 'Supports the phase 2B capability slice.',
      sourceReferences: ['https://example.com/reference', 'Confluence page'],
      stewardId: 'steward-1',
      stewardDepartment: 'Operations',
    });
  });

  it('should submit nullable fields as nulls when an edit form is cleared', () => {
    const { onSubmit } = renderCapabilityForm({
      mode: 'edit',
      initialValues: createCapabilityFormInitialValues({
        uniqueName: 'Existing capability',
        description: 'Legacy description',
        type: CapabilityType.ABSTRACT,
        lifecycleStatus: LifecycleStatus.ACTIVE,
        parentId: 'parent-1',
        domain: 'Core',
        aliases: ['Existing alias'],
        tags: ['legacy'],
        effectiveFrom: '2025-01-01T00:00:00.000Z',
        effectiveTo: '2025-12-31T00:00:00.000Z',
        rationale: 'Existing rationale',
        sourceReferences: ['Existing reference'],
        stewardId: 'steward-9',
        stewardDepartment: 'Architecture',
      }),
    });

    fireEvent.change(screen.getByLabelText(/Capability name/i), {
      target: { value: 'Updated capability' },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText(/Parent capability/i), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText(/Steward ID/i), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText(/Steward department/i), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText(/Effective from/i), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText(/Effective to/i), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText(/Domain/i), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText(/Tags/i), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText(/Aliases/i), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText(/Rationale/i), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText(/Source references/i), {
      target: { value: '' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      uniqueName: 'Updated capability',
      description: null,
      type: CapabilityType.ABSTRACT,
      lifecycleStatus: LifecycleStatus.ACTIVE,
      parentId: null,
      domain: null,
      aliases: [],
      tags: [],
      effectiveFrom: null,
      effectiveTo: null,
      rationale: null,
      sourceReferences: [],
      stewardId: null,
      stewardDepartment: null,
    });
  });
});
