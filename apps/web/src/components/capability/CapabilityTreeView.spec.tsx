import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CapabilityType, LifecycleStatus } from '@ecm/shared';
import type { CapabilitySummary } from '../../api/capabilities';
import { CapabilityTreeView } from './CapabilityTreeView';

const capabilities: CapabilitySummary[] = [
  {
    id: 'root',
    uniqueName: 'Capability map',
    description: 'Root capability',
    type: CapabilityType.ABSTRACT,
    lifecycleStatus: LifecycleStatus.ACTIVE,
    parentId: null,
  },
  {
    id: 'child',
    uniqueName: 'Payments',
    description: 'Payment services',
    type: CapabilityType.ABSTRACT,
    lifecycleStatus: LifecycleStatus.ACTIVE,
    parentId: 'root',
  },
  {
    id: 'leaf',
    uniqueName: 'Settlement',
    description: 'Settlement processing',
    type: CapabilityType.LEAF,
    lifecycleStatus: LifecycleStatus.DRAFT,
    parentId: 'child',
  },
];

function renderTree(
  searchTerm?: string,
  activeChangeRequestCountById?: ReadonlyMap<string, number>,
  initialEntries: string[] = ['/capabilities'],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <CapabilityTreeView
        capabilities={capabilities}
        searchTerm={searchTerm}
        activeChangeRequestCountById={activeChangeRequestCountById}
      />
    </MemoryRouter>,
  );
}

describe('CapabilityTreeView', () => {
  it('renders an accessible tree with treeitems', () => {
    renderTree();

    expect(
      screen.getByRole('tree', { name: /capability hierarchy/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('treeitem', { name: 'Capability map' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Payments' })).toBeInTheDocument();
  });

  it('collapses and expands branches with arrow keys', () => {
    renderTree();

    const rootNode = screen.getByRole('treeitem', { name: 'Capability map' });
    rootNode.focus();

    fireEvent.keyDown(rootNode, { key: 'ArrowLeft' });
    expect(screen.queryByRole('treeitem', { name: 'Payments' })).not.toBeInTheDocument();

    fireEvent.keyDown(rootNode, { key: 'ArrowRight' });
    expect(screen.getByRole('treeitem', { name: 'Payments' })).toBeInTheDocument();
  });

  it('moves focus between visible nodes with arrow keys', () => {
    renderTree();

    const rootNode = screen.getByRole('treeitem', { name: 'Capability map' });
    rootNode.focus();

    fireEvent.keyDown(rootNode, { key: 'ArrowDown' });
    expect(screen.getByRole('treeitem', { name: 'Payments' })).toHaveFocus();
  });

  it('keeps matching ancestors visible while filtering', () => {
    renderTree('Settlement');

    expect(
      screen.getByRole('treeitem', { name: 'Capability map' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Payments' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Settlement' })).toBeInTheDocument();
  });

  it('shows active change request badge on a capability that has in-flight CRs', () => {
    const countMap = new Map([['child', 2]]);
    renderTree(undefined, countMap);

    expect(screen.getByRole('treeitem', { name: 'Payments' })).toBeInTheDocument();
    expect(screen.getByText('2 change requests')).toBeInTheDocument();
  });

  it('does not show a change request badge when count is zero', () => {
    renderTree();

    expect(screen.queryByText(/change request/i)).not.toBeInTheDocument();
  });

  it('does not show a change request badge when no map is provided', () => {
    renderTree(undefined, undefined);

    expect(screen.queryByText(/change request/i)).not.toBeInTheDocument();
  });

  it('marks the current capability as selected when viewing its detail page', () => {
    renderTree(undefined, undefined, ['/capabilities/leaf']);

    expect(screen.getByRole('treeitem', { name: 'Settlement' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('treeitem', { name: 'Payments' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
