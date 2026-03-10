import { CapabilityType, LifecycleStatus } from '@ecm/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CapabilityDetail } from '../../api/capabilities';
import { CapabilityDetailView } from './CapabilityDetailView';

vi.mock('../CapabilityHierarchyExplorer', () => ({
  CapabilityHierarchyExplorer: ({ id }: { id: string }) => (
    <div>Child hierarchy for {id}</div>
  ),
}));

const stubCapability: CapabilityDetail = {
  id: 'cap-1',
  uniqueName: 'Customer Onboarding',
  aliases: ['Client onboarding'],
  description: 'Handles customer acquisition.',
  domain: 'Customer',
  type: CapabilityType.ABSTRACT,
  parentId: 'parent-1',
  lifecycleStatus: LifecycleStatus.ACTIVE,
  effectiveFrom: '2025-01-01',
  effectiveTo: null,
  rationale: 'Improves growth outcomes.',
  sourceReferences: ['https://example.com/spec', 'Internal deck'],
  tags: ['growth'],
  stewardId: 'steward-1',
  stewardDepartment: 'Enterprise Architecture',
  isErroneous: false,
  erroneousReason: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T12:30:00.000Z',
  parent: {
    id: 'parent-1',
    uniqueName: 'Customer Management',
  },
  children: [
    {
      id: 'child-1',
      uniqueName: 'Identity verification',
      type: CapabilityType.LEAF,
    },
  ],
};

describe('CapabilityDetailView', () => {
  it('renders grouped metadata sections with the full capability detail set', () => {
    render(
      <MemoryRouter>
        <CapabilityDetailView
          capability={stubCapability}
          stewardship={{
            capabilityId: 'cap-1',
            stewardId: 'steward-42',
            stewardDepartment: 'Enterprise Architecture',
            source: 'INHERITED',
            sourceCapabilityId: 'parent-1',
          }}
          stewardshipIsLoading={false}
          stewardshipError={null}
          onRetryStewardship={vi.fn()}
          canDelete={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /capability narrative/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /identity & hierarchy/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /stewardship/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /governance metadata/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /child capabilities/i })).toBeInTheDocument();
    expect(screen.getByText('cap-1')).toBeInTheDocument();
    expect(screen.getByText('Client onboarding')).toBeInTheDocument();
    expect(screen.getByText('growth')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Customer Management' })).toHaveAttribute(
      'href',
      '/capabilities/parent-1',
    );
    expect(
      screen.getByRole('link', { name: /inherited from customer management/i }),
    ).toHaveAttribute('href', '/capabilities/parent-1');
    expect(screen.getByRole('link', { name: /https:\/\/example.com\/spec/i })).toHaveAttribute(
      'href',
      'https://example.com/spec',
    );
    expect(screen.getByText('Internal deck')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage stewardship/i })).toHaveAttribute(
      'href',
      '/capabilities/cap-1/edit',
    );
    expect(
      screen.getByText(/only draft capabilities without child capabilities can be deleted/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Child hierarchy for cap-1')).toBeInTheDocument();
  });

  it('shows retry affordance when stewardship details fail to load', () => {
    const onRetryStewardship = vi.fn();

    render(
      <MemoryRouter>
        <CapabilityDetailView
          capability={stubCapability}
          stewardship={undefined}
          stewardshipIsLoading={false}
          stewardshipError={new Error('Unavailable')}
          onRetryStewardship={onRetryStewardship}
          canDelete
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(
      screen.getByText(/unable to load stewardship assignment/i),
    ).toBeInTheDocument();
    expect(onRetryStewardship).toHaveBeenCalledTimes(1);
  });
});
