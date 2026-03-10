import { MappingState } from '@ecm/shared';
// MappingImpact is a display-only type used exclusively by MappingImpactBadge.
export type MappingImpact = 'BREAKS' | 'DEPRECATED' | 'REQUIRES_REMAPPING';

export type MappingBadgeSize = 'default' | 'sm';

const variantByMappingState: Record<MappingState, string> = {
  [MappingState.ACTIVE]: 'positive',
  [MappingState.INACTIVE]: 'negative',
  [MappingState.PENDING]: 'neutral',
};

const variantByMappingImpact: Record<MappingImpact, string> = {
  BREAKS: 'negative',
  DEPRECATED: 'warning',
  REQUIRES_REMAPPING: 'accent',
};

function getBadgeSizeClass(size: MappingBadgeSize): string {
  return size === 'sm' ? ' sapphire-badge--sm' : '';
}

export interface MappingTypeBadgeProps {
  /** Free-form integration category string, e.g. "CONSUMES", "MANAGES". */
  type: string;
  size?: MappingBadgeSize;
}

export function MappingTypeBadge({ type, size = 'default' }: MappingTypeBadgeProps) {
  return (
    <span className={`sapphire-badge${getBadgeSizeClass(size)} sapphire-badge--accent`}>
      {type}
    </span>
  );
}

export interface MappingStateBadgeProps {
  state: MappingState;
  size?: MappingBadgeSize;
}

export function MappingStateBadge({ state, size = 'default' }: MappingStateBadgeProps) {
  return (
    <span
      className={`sapphire-badge${getBadgeSizeClass(size)} sapphire-badge--${variantByMappingState[state]}`}
    >
      {state}
    </span>
  );
}

export interface MappingImpactBadgeProps {
  impact: MappingImpact;
  size?: MappingBadgeSize;
}

export function MappingImpactBadge({ impact, size = 'default' }: MappingImpactBadgeProps) {
  return (
    <span
      className={`sapphire-badge${getBadgeSizeClass(size)} sapphire-badge--${variantByMappingImpact[impact]}`}
    >
      {impact}
    </span>
  );
}
