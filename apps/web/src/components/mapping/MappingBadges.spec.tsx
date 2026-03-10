import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MappingState } from '@ecm/shared';
import { MappingImpactBadge, MappingStateBadge, MappingTypeBadge } from './MappingBadges';

describe('Mapping badges', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders mapping type badges with the accent variant', () => {
    const { rerender } = render(<MappingTypeBadge type="CONSUMES" />);
    expect(screen.getByText('CONSUMES')).toHaveClass('sapphire-badge--accent');

    rerender(<MappingTypeBadge type="MANAGES" size="sm" />);
    expect(screen.getByText('MANAGES')).toHaveClass('sapphire-badge--accent', 'sapphire-badge--sm');

    rerender(<MappingTypeBadge type="READS" />);
    expect(screen.getByText('READS')).toHaveClass('sapphire-badge--accent');
  });

  it('renders mapping state badges with the correct Sapphire variants', () => {
    const expectations = [
      { state: MappingState.ACTIVE, variant: 'positive' },
      { state: MappingState.INACTIVE, variant: 'negative' },
      { state: MappingState.PENDING, variant: 'neutral' },
    ];

    expectations.forEach(({ state, variant }) => {
      const { unmount } = render(<MappingStateBadge state={state} />);
      expect(screen.getByText(state)).toHaveClass(`sapphire-badge--${variant}`);
      unmount();
    });
  });

  it('renders mapping impact badges with the correct Sapphire variants', () => {
    const expectations = [
      { impact: 'BREAKS' as const, variant: 'negative' },
      { impact: 'DEPRECATED' as const, variant: 'warning' },
      { impact: 'REQUIRES_REMAPPING' as const, variant: 'accent' },
    ];

    expectations.forEach(({ impact, variant }) => {
      const { unmount } = render(<MappingImpactBadge impact={impact} />);
      expect(screen.getByText(impact)).toHaveClass(`sapphire-badge--${variant}`);
      unmount();
    });
  });
});
