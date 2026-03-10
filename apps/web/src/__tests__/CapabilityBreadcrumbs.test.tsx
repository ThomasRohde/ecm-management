import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CapabilityBreadcrumbs } from '../components/CapabilityBreadcrumbs';
import * as capabilitiesApi from '../api/capabilities';

vi.mock('../api/capabilities');

const mockUseCapabilityBreadcrumbs = vi.mocked(
  capabilitiesApi.useCapabilityBreadcrumbs,
);

function renderBreadcrumbs(id = 'cap-1') {
  return render(
    <MemoryRouter>
      <CapabilityBreadcrumbs id={id} />
    </MemoryRouter>,
  );
}

describe('CapabilityBreadcrumbs', () => {
  it('renders a loading placeholder while breadcrumbs are loading', () => {
    mockUseCapabilityBreadcrumbs.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof capabilitiesApi.useCapabilityBreadcrumbs>);

    renderBreadcrumbs();

    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading breadcrumbs/i })).toBeInTheDocument();
  });

  it('renders the current page crumb when there is only one breadcrumb', () => {
    mockUseCapabilityBreadcrumbs.mockReturnValue({
      data: [{ id: 'root', uniqueName: 'Root Capability' }],
      isLoading: false,
    } as ReturnType<typeof capabilitiesApi.useCapabilityBreadcrumbs>);

    renderBreadcrumbs('root');

    const currentPage = screen.getByText('Root Capability');
    expect(currentPage).toBeInTheDocument();
    expect(currentPage).toHaveAttribute('aria-current', 'page');
  });

  it('renders a breadcrumb nav when there are multiple crumbs', () => {
    mockUseCapabilityBreadcrumbs.mockReturnValue({
      data: [
        { id: 'root', uniqueName: 'Root' },
        { id: 'child', uniqueName: 'Child' },
      ],
      isLoading: false,
    } as ReturnType<typeof capabilitiesApi.useCapabilityBreadcrumbs>);

    renderBreadcrumbs('child');

    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Root' })).toBeInTheDocument();
    expect(screen.getByText('Child')).toBeInTheDocument();
  });

  it('marks the last item with aria-current="page"', () => {
    mockUseCapabilityBreadcrumbs.mockReturnValue({
      data: [
        { id: 'root', uniqueName: 'Root' },
        { id: 'mid', uniqueName: 'Middle' },
        { id: 'leaf', uniqueName: 'Leaf Node' },
      ],
      isLoading: false,
    } as ReturnType<typeof capabilitiesApi.useCapabilityBreadcrumbs>);

    renderBreadcrumbs('leaf');

    const currentPage = screen.getByText('Leaf Node');
    expect(currentPage).toHaveAttribute('aria-current', 'page');
    // Intermediate crumbs are links, not current
    expect(screen.getByRole('link', { name: 'Root' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('renders ancestor crumbs as links pointing to /capabilities/:id', () => {
    mockUseCapabilityBreadcrumbs.mockReturnValue({
      data: [
        { id: 'parent-id', uniqueName: 'Parent Cap' },
        { id: 'current-id', uniqueName: 'Current Cap' },
      ],
      isLoading: false,
    } as ReturnType<typeof capabilitiesApi.useCapabilityBreadcrumbs>);

    renderBreadcrumbs('current-id');

    const parentLink = screen.getByRole('link', { name: 'Parent Cap' });
    expect(parentLink).toHaveAttribute('href', '/capabilities/parent-id');
  });

  it('renders separator glyphs between crumbs', () => {
    mockUseCapabilityBreadcrumbs.mockReturnValue({
      data: [
        { id: 'a', uniqueName: 'A' },
        { id: 'b', uniqueName: 'B' },
        { id: 'c', uniqueName: 'C' },
      ],
      isLoading: false,
    } as ReturnType<typeof capabilitiesApi.useCapabilityBreadcrumbs>);

    renderBreadcrumbs('c');

    // Separators are aria-hidden so we use getAllByText
    const separators = screen.getAllByText('/');
    // Two separators: between A→B and B→C
    expect(separators).toHaveLength(2);
    separators.forEach((sep) => expect(sep).toHaveAttribute('aria-hidden', 'true'));
  });

  it('does not render separator after last item', () => {
    mockUseCapabilityBreadcrumbs.mockReturnValue({
      data: [
        { id: 'p', uniqueName: 'Parent' },
        { id: 'c', uniqueName: 'Child' },
      ],
      isLoading: false,
    } as ReturnType<typeof capabilitiesApi.useCapabilityBreadcrumbs>);

    renderBreadcrumbs('c');

    // One separator between parent and child only
    expect(screen.getAllByText('/')).toHaveLength(1);
  });

  it('collapses long paths until the user expands them', () => {
    mockUseCapabilityBreadcrumbs.mockReturnValue({
      data: [
        { id: 'root', uniqueName: 'Root' },
        { id: 'domain', uniqueName: 'Domain' },
        { id: 'area', uniqueName: 'Area' },
        { id: 'leaf', uniqueName: 'Leaf Node' },
      ],
      isLoading: false,
    } as ReturnType<typeof capabilitiesApi.useCapabilityBreadcrumbs>);

    renderBreadcrumbs('leaf');

    expect(screen.getByRole('link', { name: 'Root' })).toBeInTheDocument();
    expect(screen.queryByText('Domain')).not.toBeInTheDocument();
    expect(screen.queryByText('Area')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /show 2 hidden breadcrumb items/i }),
    );

    expect(screen.getByText('Domain')).toBeInTheDocument();
    expect(screen.getByText('Area')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /collapse path/i })).toBeInTheDocument();
  });
});
