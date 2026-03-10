import { ModelVersionStateEnum } from '@ecm/shared';

type BadgeSize = 'default' | 'sm';

const stateVariant: Record<ModelVersionStateEnum, string> = {
  [ModelVersionStateEnum.DRAFT]: 'neutral',
  [ModelVersionStateEnum.PUBLISHED]: 'positive',
  [ModelVersionStateEnum.ROLLED_BACK]: 'warning',
};

const stateLabel: Record<ModelVersionStateEnum, string> = {
  [ModelVersionStateEnum.DRAFT]: 'Draft',
  [ModelVersionStateEnum.PUBLISHED]: 'Published',
  [ModelVersionStateEnum.ROLLED_BACK]: 'Rolled back',
};

function getBadgeSizeClass(size: BadgeSize): string {
  return size === 'sm' ? ' sapphire-badge--sm' : '';
}

interface ReleaseStatusBadgeProps {
  state: ModelVersionStateEnum;
  size?: BadgeSize;
}

export function ReleaseStatusBadge({ state, size = 'default' }: ReleaseStatusBadgeProps) {
  return (
    <span
      className={`sapphire-badge${getBadgeSizeClass(size)} sapphire-badge--${stateVariant[state]}`}
    >
      {stateLabel[state]}
    </span>
  );
}
