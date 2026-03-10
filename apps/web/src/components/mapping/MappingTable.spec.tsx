import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MappingState } from '@ecm/shared';
import { MappingTable } from './MappingTable';
import type { MappingDisplayDto } from './mapping.types';

const mappings: MappingDisplayDto[] = [
  {
    id: 'mapping-1',
    mappingType: 'CONSUMES',
    systemId: 'SYS-001',
    systemName: 'Payments Hub',
    capabilityId: 'CAP-001',
    capabilityName: 'Payment Processing',
    state: MappingState.ACTIVE,
    attributes: {},
    createdAt: '2025-02-01T00:00:00.000Z',
    updatedAt: '2025-02-15T00:00:00.000Z',
  },
  {
    id: 'mapping-2',
    mappingType: 'READS',
    systemId: 'SYS-002',
    systemName: 'Finance Lake',
    capabilityId: 'CAP-001',
    capabilityName: 'Payment Processing',
    state: MappingState.PENDING,
    attributes: {},
    createdAt: '2025-02-02T00:00:00.000Z',
    updatedAt: '2025-02-16T00:00:00.000Z',
  },
];

describe('MappingTable', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the "Add mapping" button when onAdd is provided', () => {
    render(<MappingTable mappings={mappings} onAdd={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add mapping/i })).toBeInTheDocument();
  });

  it('does not render the "Add mapping" button when onAdd is absent', () => {
    render(<MappingTable mappings={mappings} />);
    expect(screen.queryByRole('button', { name: /add mapping/i })).not.toBeInTheDocument();
  });

  it('renders a row for each mapping', () => {
    render(<MappingTable mappings={mappings} />);
    expect(screen.getByText('Payments Hub')).toBeInTheDocument();
    expect(screen.getByText('Finance Lake')).toBeInTheDocument();
  });

  it('renders the empty state message when mappings is empty', () => {
    render(<MappingTable mappings={[]} emptyMessage="No mappings found." />);
    expect(screen.getByText('No mappings found.')).toBeInTheDocument();
  });

  it('renders a loading state while isLoading is true', () => {
    render(<MappingTable mappings={[]} isLoading />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('renders the error state with a retry button when error is provided', () => {
    const onRetry = vi.fn();
    render(<MappingTable mappings={[]} error={new Error('Request failed')} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/request failed/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls onEdit with the correct mapping when Edit is clicked', () => {
    const onEdit = vi.fn();
    render(<MappingTable mappings={mappings} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /edit payments hub/i }));
    expect(onEdit).toHaveBeenCalledWith(mappings[0]);
  });

  it('calls onDelete with the correct mapping when Delete is clicked', () => {
    const onDelete = vi.fn();
    render(<MappingTable mappings={mappings} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete payments hub/i }));
    expect(onDelete).toHaveBeenCalledWith(mappings[0]);
  });
});
