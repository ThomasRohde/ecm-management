import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CapabilityType, LifecycleStatus } from '@ecm/shared';
import type { CapabilitySummary } from '../../api/capabilities';
import { LeafOnlyView } from './LeafOnlyView';

const capabilities: CapabilitySummary[] = [
  {
    id: 'cap-1',
    uniqueName: 'Capability map',
    description: 'Root capability',
    type: CapabilityType.ABSTRACT,
    lifecycleStatus: LifecycleStatus.ACTIVE,
    parentId: null,
  },
  {
    id: 'cap-2',
    uniqueName: 'Settlement',
    description: 'Settlement flow',
    type: CapabilityType.LEAF,
    lifecycleStatus: LifecycleStatus.DRAFT,
    parentId: 'cap-1',
  },
];

describe('LeafOnlyView', () => {
  it('shows only leaf capabilities', () => {
    render(
      <MemoryRouter>
        <LeafOnlyView capabilities={capabilities} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /settlement/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /capability map/i }),
    ).not.toBeInTheDocument();
  });

  it('shows an empty state when no leaf capabilities match the search', () => {
    render(
      <MemoryRouter>
        <LeafOnlyView capabilities={capabilities} searchTerm="missing" />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('No leaf capabilities match the current search or filters.'),
    ).toBeInTheDocument();
  });

  it('shows an active change request badge when the leaf has in-flight CRs', () => {
    const countMap = new Map([['cap-2', 1]]);
    render(
      <MemoryRouter>
        <LeafOnlyView capabilities={capabilities} activeChangeRequestCountById={countMap} />
      </MemoryRouter>,
    );

    expect(screen.getByText('1 change request')).toBeInTheDocument();
  });

  it('shows a pluralised badge label when there are multiple active CRs', () => {
    const countMap = new Map([['cap-2', 3]]);
    render(
      <MemoryRouter>
        <LeafOnlyView capabilities={capabilities} activeChangeRequestCountById={countMap} />
      </MemoryRouter>,
    );

    expect(screen.getByText('3 change requests')).toBeInTheDocument();
  });

  it('does not show a change request badge when count is zero', () => {
    render(
      <MemoryRouter>
        <LeafOnlyView capabilities={capabilities} />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/change request/i)).not.toBeInTheDocument();
  });
});
