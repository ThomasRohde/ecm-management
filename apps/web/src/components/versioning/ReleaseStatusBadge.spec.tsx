import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModelVersionStateEnum } from '@ecm/shared';
import { ReleaseStatusBadge } from './ReleaseStatusBadge';

describe('ReleaseStatusBadge', () => {
  it('should show "Draft" for DRAFT state', () => {
    render(<ReleaseStatusBadge state={ModelVersionStateEnum.DRAFT} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('should show "Published" for PUBLISHED state', () => {
    render(<ReleaseStatusBadge state={ModelVersionStateEnum.PUBLISHED} />);
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('should show "Rolled back" for ROLLED_BACK state', () => {
    render(<ReleaseStatusBadge state={ModelVersionStateEnum.ROLLED_BACK} />);
    expect(screen.getByText('Rolled back')).toBeInTheDocument();
  });

  it('should apply the positive variant class for PUBLISHED', () => {
    render(<ReleaseStatusBadge state={ModelVersionStateEnum.PUBLISHED} />);
    expect(screen.getByText('Published')).toHaveClass('sapphire-badge--positive');
  });

  it('should apply the neutral variant class for DRAFT', () => {
    render(<ReleaseStatusBadge state={ModelVersionStateEnum.DRAFT} />);
    expect(screen.getByText('Draft')).toHaveClass('sapphire-badge--neutral');
  });

  it('should apply the warning variant class for ROLLED_BACK', () => {
    render(<ReleaseStatusBadge state={ModelVersionStateEnum.ROLLED_BACK} />);
    expect(screen.getByText('Rolled back')).toHaveClass('sapphire-badge--warning');
  });

  it('should apply the --sm modifier when size is "sm"', () => {
    render(<ReleaseStatusBadge state={ModelVersionStateEnum.DRAFT} size="sm" />);
    expect(screen.getByText('Draft')).toHaveClass('sapphire-badge--sm');
  });

  it('should not apply the --sm modifier when size is "default"', () => {
    render(<ReleaseStatusBadge state={ModelVersionStateEnum.DRAFT} size="default" />);
    expect(screen.getByText('Draft')).not.toHaveClass('sapphire-badge--sm');
  });
});
