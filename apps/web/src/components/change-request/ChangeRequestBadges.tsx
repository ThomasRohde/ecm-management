import { ChangeRequestStatus, ChangeRequestType } from '@ecm/shared';

type BadgeSize = 'default' | 'sm';

function getBadgeSizeClass(size: BadgeSize): string {
  return size === 'sm' ? ' sapphire-badge--sm' : '';
}

const statusVariant: Record<ChangeRequestStatus, string> = {
  [ChangeRequestStatus.DRAFT]: 'neutral',
  [ChangeRequestStatus.SUBMITTED]: 'accent',
  [ChangeRequestStatus.PENDING_APPROVAL]: 'warning',
  [ChangeRequestStatus.APPROVED]: 'positive',
  [ChangeRequestStatus.EXECUTING]: 'warning',
  [ChangeRequestStatus.COMPLETED]: 'positive',
  [ChangeRequestStatus.REJECTED]: 'negative',
  [ChangeRequestStatus.CANCELLED]: 'neutral',
};

const statusLabel: Record<ChangeRequestStatus, string> = {
  [ChangeRequestStatus.DRAFT]: 'Draft',
  [ChangeRequestStatus.SUBMITTED]: 'Submitted',
  [ChangeRequestStatus.PENDING_APPROVAL]: 'Pending approval',
  [ChangeRequestStatus.APPROVED]: 'Approved',
  [ChangeRequestStatus.EXECUTING]: 'Executing',
  [ChangeRequestStatus.COMPLETED]: 'Completed',
  [ChangeRequestStatus.REJECTED]: 'Rejected',
  [ChangeRequestStatus.CANCELLED]: 'Cancelled',
};

interface ChangeRequestStatusBadgeProps {
  status: ChangeRequestStatus;
  size?: BadgeSize;
}

export function ChangeRequestStatusBadge({
  status,
  size = 'default',
}: ChangeRequestStatusBadgeProps) {
  return (
    <span
      className={`sapphire-badge${getBadgeSizeClass(size)} sapphire-badge--${statusVariant[status]}`}
    >
      {statusLabel[status]}
    </span>
  );
}

const typeLabel: Record<ChangeRequestType, string> = {
  [ChangeRequestType.CREATE]: 'Create',
  [ChangeRequestType.UPDATE]: 'Update',
  [ChangeRequestType.DELETE]: 'Delete',
  [ChangeRequestType.REPARENT]: 'Re-parent',
  [ChangeRequestType.PROMOTE]: 'Promote',
  [ChangeRequestType.DEMOTE]: 'Demote',
  [ChangeRequestType.MERGE]: 'Merge',
  [ChangeRequestType.RETIRE]: 'Retire',
};

interface ChangeRequestTypeBadgeProps {
  type: ChangeRequestType;
  size?: BadgeSize;
}

export function ChangeRequestTypeBadge({
  type,
  size = 'default',
}: ChangeRequestTypeBadgeProps) {
  return (
    <span className={`sapphire-badge${getBadgeSizeClass(size)} sapphire-badge--accent`}>
      {typeLabel[type]}
    </span>
  );
}

interface ActiveChangeRequestsBadgeProps {
  count: number;
  size?: BadgeSize;
}

/**
 * Compact warning badge for list/card/tree surfaces. Returns null when count is 0
 * so callers can render it unconditionally.
 */
export function ActiveChangeRequestsBadge({
  count,
  size = 'default',
}: ActiveChangeRequestsBadgeProps) {
  if (count <= 0) return null;

  const label = count === 1 ? '1 change request' : `${count} change requests`;

  return (
    <span
      className={`sapphire-badge${getBadgeSizeClass(size)} sapphire-badge--warning`}
      aria-label={`${count} active ${count === 1 ? 'change request' : 'change requests'}`}
    >
      {label}
    </span>
  );
}

export { statusLabel as changeRequestStatusLabel, typeLabel as changeRequestTypeLabel };
