import { LifecycleStatus } from '@ecm/shared';
import type { CapabilityStewardship, CapabilityType } from '@ecm/shared';

type CapabilityBadgeSize = 'default' | 'sm';

const statusVariantByLifecycleStatus: Record<LifecycleStatus, string> = {
  [LifecycleStatus.DRAFT]: 'neutral',
  [LifecycleStatus.ACTIVE]: 'positive',
  [LifecycleStatus.DEPRECATED]: 'warning',
  [LifecycleStatus.RETIRED]: 'negative',
};

const stewardshipVariantBySource: Record<CapabilityStewardship['source'], string> = {
  DIRECT: 'positive',
  INHERITED: 'warning',
  UNASSIGNED: 'neutral',
};

const stewardshipLabelBySource: Record<CapabilityStewardship['source'], string> = {
  DIRECT: 'Direct assignment',
  INHERITED: 'Inherited',
  UNASSIGNED: 'Unassigned',
};

function getBadgeSizeClass(size: CapabilityBadgeSize): string {
  return size === 'sm' ? ' sapphire-badge--sm' : '';
}

interface CapabilityStatusBadgeProps {
  status: LifecycleStatus;
  size?: CapabilityBadgeSize;
}

export function CapabilityStatusBadge({
  status,
  size = 'default',
}: CapabilityStatusBadgeProps) {
  return (
    <span
      className={`sapphire-badge${getBadgeSizeClass(size)} sapphire-badge--${statusVariantByLifecycleStatus[status]}`}
    >
      {status}
    </span>
  );
}

interface CapabilityTypeBadgeProps {
  type: CapabilityType;
  size?: CapabilityBadgeSize;
}

export function CapabilityTypeBadge({
  type,
  size = 'default',
}: CapabilityTypeBadgeProps) {
  return (
    <span className={`sapphire-badge${getBadgeSizeClass(size)} sapphire-badge--accent`}>
      {type}
    </span>
  );
}

interface CapabilityStewardshipSourceBadgeProps {
  source: CapabilityStewardship['source'];
  size?: CapabilityBadgeSize;
}

export function CapabilityStewardshipSourceBadge({
  source,
  size = 'default',
}: CapabilityStewardshipSourceBadgeProps) {
  return (
    <span
      className={`sapphire-badge${getBadgeSizeClass(size)} sapphire-badge--${stewardshipVariantBySource[source]}`}
    >
      {stewardshipLabelBySource[source]}
    </span>
  );
}
