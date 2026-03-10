import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CapabilityType, LifecycleStatus } from '@ecm/shared';
import { CapabilityHierarchyExplorer } from '../components/CapabilityHierarchyExplorer';
import * as capabilitiesApi from '../api/capabilities';

vi.mock('../api/capabilities');

const mockUseCapabilitySubtree = vi.mocked(capabilitiesApi.useCapabilitySubtree);
const mockUseCapabilityLeaves = vi.mocked(capabilitiesApi.useCapabilityLeaves);

const stubChildren = [
  { id: 'child-1', uniqueName: 'Alpha Service', type: CapabilityType.LEAF },
  { id: 'child-2', uniqueName: 'Beta Service', type: CapabilityType.ABSTRACT },
];

function defaultSubtreeResult() {
  return {
    data: { id: 'root', uniqueName: 'Root', type: CapabilityType.ABSTRACT, children: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof capabilitiesApi.useCapabilitySubtree>;
}

function defaultLeavesResult() {
  return {
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityLeaves>;
}

function renderExplorer(
  children = stubChildren,
  id = 'cap-1',
) {
  mockUseCapabilitySubtree.mockReturnValue(defaultSubtreeResult());
  mockUseCapabilityLeaves.mockReturnValue(defaultLeavesResult());

  return render(
    <MemoryRouter>
      <CapabilityHierarchyExplorer id={id} directChildren={children} />
    </MemoryRouter>,
  );
}

describe('CapabilityHierarchyExplorer', () => {
  describe('view mode buttons', () => {
    it('renders three view-mode buttons', () => {
      renderExplorer();

      expect(screen.getByRole('button', { name: /direct children/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /full subtree/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /leaf capabilities/i })).toBeInTheDocument();
    });

    it('defaults to "Direct children" mode pressed', () => {
      renderExplorer();

      expect(screen.getByRole('button', { name: /direct children/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: /full subtree/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(screen.getByRole('button', { name: /leaf capabilities/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('switches to subtree view when "Full subtree" is clicked', () => {
      renderExplorer();

      fireEvent.click(screen.getByRole('button', { name: /full subtree/i }));

      expect(screen.getByRole('button', { name: /full subtree/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: /direct children/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('switches to leaves view when "Leaf capabilities" is clicked', () => {
      renderExplorer();

      fireEvent.click(screen.getByRole('button', { name: /leaf capabilities/i }));

      expect(screen.getByRole('button', { name: /leaf capabilities/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('view-mode buttons are grouped with aria-label', () => {
      renderExplorer();

      expect(
        screen.getByRole('group', { name: /hierarchy view mode/i }),
      ).toBeInTheDocument();
    });
  });

  describe('children view (default)', () => {
    it('renders direct children as links', () => {
      renderExplorer();

      expect(screen.getByRole('link', { name: 'Alpha Service' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Beta Service' })).toBeInTheDocument();
    });

    it('shows type badges for each child', () => {
      renderExplorer();

      expect(screen.getByText(CapabilityType.LEAF)).toBeInTheDocument();
      expect(screen.getByText(CapabilityType.ABSTRACT)).toBeInTheDocument();
    });

    it('shows empty-state message when there are no children', () => {
      renderExplorer([]);

      expect(screen.getByText('No child capabilities.')).toBeInTheDocument();
    });

    it('child links navigate to /capabilities/:id', () => {
      renderExplorer();

      expect(screen.getByRole('link', { name: 'Alpha Service' })).toHaveAttribute(
        'href',
        '/capabilities/child-1',
      );
    });
  });

  describe('filter input', () => {
    it('renders an accessible filter input', () => {
      renderExplorer();

      const input = screen.getByRole('searchbox', { name: /filter capabilities by name/i });
      expect(input).toBeInTheDocument();
    });

    it('filters the children list by name substring (case-insensitive)', () => {
      renderExplorer();

      const filter = screen.getByRole('searchbox', { name: /filter capabilities by name/i });
      fireEvent.change(filter, { target: { value: 'alpha' } });

      expect(screen.getByRole('link', { name: 'Alpha Service' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Beta Service' })).not.toBeInTheDocument();
    });

    it('shows no-match message when filter yields no children', () => {
      renderExplorer();

      fireEvent.change(
        screen.getByRole('searchbox', { name: /filter capabilities by name/i }),
        { target: { value: 'zzznomatch' } },
      );

      expect(screen.getByText('No children match the filter.')).toBeInTheDocument();
    });

    it('clears filter and shows all children again', () => {
      renderExplorer();

      const filter = screen.getByRole('searchbox', { name: /filter capabilities by name/i });
      fireEvent.change(filter, { target: { value: 'alpha' } });
      fireEvent.change(filter, { target: { value: '' } });

      expect(screen.getByRole('link', { name: 'Alpha Service' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Beta Service' })).toBeInTheDocument();
    });
  });

  describe('leaves view', () => {
    it('shows leaves from the API when leaves view is active', () => {
      mockUseCapabilitySubtree.mockReturnValue(defaultSubtreeResult());
      mockUseCapabilityLeaves.mockReturnValue({
        data: [
          {
            id: 'leaf-1',
            uniqueName: 'Leaf One',
            type: CapabilityType.LEAF,
            lifecycleStatus: LifecycleStatus.ACTIVE,
            description: 'Leaf description',
            parentId: 'cap-1',
          },
        ],
        isLoading: false,
      } as unknown as ReturnType<typeof capabilitiesApi.useCapabilityLeaves>);

      render(
        <MemoryRouter>
          <CapabilityHierarchyExplorer id="cap-1" directChildren={[]} />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: /leaf capabilities/i }));

      expect(screen.getByRole('link', { name: 'Leaf One' })).toBeInTheDocument();
      expect(screen.getByText('Leaf description')).toBeInTheDocument();
    });

    it('shows empty-state message when there are no leaves', () => {
      renderExplorer();

      fireEvent.click(screen.getByRole('button', { name: /leaf capabilities/i }));

      expect(
        screen.getByText('No leaf capabilities under this node.'),
      ).toBeInTheDocument();
    });
  });

  describe('loading states', () => {
    it('shows loading indicator while subtree is loading', () => {
      mockUseCapabilitySubtree.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof capabilitiesApi.useCapabilitySubtree>);
      mockUseCapabilityLeaves.mockReturnValue(defaultLeavesResult());

      render(
        <MemoryRouter>
          <CapabilityHierarchyExplorer id="cap-1" directChildren={[]} />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: /full subtree/i }));

      expect(
        screen.getByRole('status', { name: /loading hierarchy view/i }),
      ).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Loading hierarchy…')).toBeInTheDocument();
    });
  });
});
