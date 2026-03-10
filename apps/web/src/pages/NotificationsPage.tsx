import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TaskOrNotification } from '@ecm/shared';
import {
  NotificationEventType,
  NotificationStatus,
  useDismissNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../api/notifications';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import { useAuth } from '../contexts/AuthContext';
import styles from './NotificationsPage.module.css';

const statusOptions = [
  { value: '', label: 'All statuses' },
  { value: NotificationStatus.UNREAD, label: 'Unread' },
  { value: NotificationStatus.READ, label: 'Read' },
  { value: NotificationStatus.DISMISSED, label: 'Dismissed' },
] as const;

const eventOptions = [
  { value: '', label: 'All event types' },
  { value: NotificationEventType.CHANGE_REQUEST_SUBMITTED, label: 'Change request submitted' },
  { value: NotificationEventType.CHANGE_REQUEST_APPROVED, label: 'Change request approved' },
  { value: NotificationEventType.CHANGE_REQUEST_REJECTED, label: 'Change request rejected' },
  { value: NotificationEventType.METADATA_CHANGED, label: 'Metadata changed' },
  { value: NotificationEventType.MODEL_PUBLISHED, label: 'Model published' },
  { value: NotificationEventType.MODEL_ROLLED_BACK, label: 'Model rolled back' },
  { value: NotificationEventType.TASK_ASSIGNED, label: 'Task assigned' },
] as const;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getStatusBadgeVariant(status: NotificationStatus): string {
  switch (status) {
    case NotificationStatus.UNREAD:
      return 'accent';
    case NotificationStatus.READ:
      return 'neutral';
    case NotificationStatus.DISMISSED:
      return 'warning';
  }
}

function getEventLabel(eventType: NotificationEventType): string {
  return eventOptions.find((option) => option.value === eventType)?.label ?? eventType;
}

function getNotificationTarget(notification: TaskOrNotification): { to: string; label: string } | null {
  if (!notification.entityId || !notification.entityType) {
    return null;
  }

  switch (notification.entityType) {
    case 'CAPABILITY':
      return { to: `/capabilities/${notification.entityId}`, label: 'Open capability' };
    case 'CHANGE_REQUEST':
      return { to: `/change-requests/${notification.entityId}`, label: 'Open change request' };
    case 'MODEL_VERSION':
      return { to: '/releases', label: 'Open releases' };
    case 'MAPPING':
      return { to: '/mappings', label: 'Open mappings' };
    default:
      return null;
  }
}

function NotificationsLoadingState() {
  return (
    <div
      className={`sapphire-stack sapphire-stack--gap-md ${styles.list}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading notifications"
    >
      {[0, 1, 2].map((index) => (
        <section key={index} className="sapphire-card sapphire-stack sapphire-stack--gap-sm">
          <div className={`sapphire-row ${styles.cardHeader}`}>
            <LoadingSkeleton width="14rem" height="1.1rem" />
            <LoadingSkeleton width="6rem" height="1.4rem" radius="pill" />
          </div>
          <LoadingSkeleton width="9rem" height="0.9rem" />
          <LoadingSkeleton width="100%" height="0.9rem" />
          <LoadingSkeleton width="60%" height="0.9rem" />
        </section>
      ))}
    </div>
  );
}

export function NotificationsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [statusFilter, setStatusFilter] = useState<NotificationStatus | ''>('');
  const [eventFilter, setEventFilter] = useState<NotificationEventType | ''>('');
  const notificationsQuery = useNotifications(
    user
      ? {
          recipientId: user.id,
          status: statusFilter || undefined,
          eventType: eventFilter || undefined,
          limit: 50,
          offset: 0,
        }
      : null,
  );
  const markReadMutation = useMarkNotificationRead(user?.id ?? '');
  const dismissMutation = useDismissNotification(user?.id ?? '');
  const markAllReadMutation = useMarkAllNotificationsRead(user?.id ?? '');

  if (authLoading) {
    return <NotificationsLoadingState />;
  }

  if (!isAuthenticated || !user) {
    return (
      <StateMessageCard
        title="Sign in required"
        description={(
          <>
            You must sign in to view your notifications inbox.{' '}
            <Link to="/login">Go to the login page.</Link>
          </>
        )}
        role="status"
      />
    );
  }

  if (notificationsQuery.isLoading) {
    return <NotificationsLoadingState />;
  }

  if (notificationsQuery.error) {
    return (
      <StateMessageCard
        title="Error loading notifications"
        description={notificationsQuery.error.message}
        variant="error"
        role="alert"
        action={(
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            onClick={() => {
              void notificationsQuery.refetch();
            }}
          >
            <span className="sapphire-button__content">Retry</span>
          </button>
        )}
      />
    );
  }

  const items = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const mutationError =
    markReadMutation.error ?? dismissMutation.error ?? markAllReadMutation.error ?? null;
  const isMutating =
    markReadMutation.isPending ||
    dismissMutation.isPending ||
    markAllReadMutation.isPending;
  const summaryLabel =
    unreadCount === 1 ? '1 unread notification' : `${unreadCount} unread notifications`;

  return (
    <div className="sapphire-stack sapphire-stack--gap-xl">
      <div className={`sapphire-row ${styles.pageHeader}`}>
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <h2 className="sapphire-text sapphire-text--heading-lg">Notifications inbox</h2>
          <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
            Track workflow events, publishing updates, and follow-up tasks for your account.
          </p>
        </div>

        <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.headerActions}`}>
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            {summaryLabel}
          </p>
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            onClick={() => {
              markAllReadMutation.mutate();
            }}
            disabled={unreadCount === 0 || isMutating}
          >
            <span className="sapphire-button__content">
              {markAllReadMutation.isPending ? 'Marking...' : 'Mark all read'}
            </span>
          </button>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.filterField}`}>
          <label className="sapphire-field-label" htmlFor="notification-status-filter">
            Status
          </label>
          <select
            id="notification-status-filter"
            className="sapphire-text-field"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as NotificationStatus | '');
            }}
          >
            {statusOptions.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.filterField}`}>
          <label className="sapphire-field-label" htmlFor="notification-event-filter">
            Event type
          </label>
          <select
            id="notification-event-filter"
            className="sapphire-text-field"
            value={eventFilter}
            onChange={(event) => {
              setEventFilter(event.target.value as NotificationEventType | '');
            }}
          >
            {eventOptions.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mutationError ? (
        <StateMessageCard
          title="Unable to update notifications"
          description={mutationError.message}
          variant="error"
          role="alert"
        />
      ) : null}

      {isMutating ? (
        <p
          className="sapphire-text sapphire-text--body-sm sapphire-text--secondary"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          Updating notifications…
        </p>
      ) : null}

      {items.length === 0 ? (
        <StateMessageCard
          title="No notifications"
          description="Notifications that require your attention will appear here."
          role="status"
        />
      ) : (
        <ul
          className={styles.list}
          aria-label="Notifications"
          aria-busy={isMutating ? 'true' : undefined}
        >
          {items.map((notification) => {
            const target = getNotificationTarget(notification);

            return (
              <li key={notification.id}>
                <article className={`sapphire-card sapphire-stack sapphire-stack--gap-md ${styles.card}`}>
                  <div className={`sapphire-row ${styles.cardHeader}`}>
                    <div className="sapphire-stack sapphire-stack--gap-xs" style={{ flex: 1 }}>
                      <h3 className="sapphire-text sapphire-text--heading-xs">
                        {notification.title}
                      </h3>
                      <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                        {formatDateTime(notification.createdAt)}
                      </p>
                    </div>

                    <div className={styles.badges}>
                      <span
                        className={`sapphire-badge sapphire-badge--sm sapphire-badge--${getStatusBadgeVariant(notification.status)}`}
                      >
                        {notification.status.toLowerCase()}
                      </span>
                      <span className="sapphire-badge sapphire-badge--neutral sapphire-badge--sm">
                        {getEventLabel(notification.eventType)}
                      </span>
                    </div>
                  </div>

                  {notification.body ? (
                    <p className="sapphire-text sapphire-text--body-sm">{notification.body}</p>
                  ) : null}

                  <div className={`sapphire-row ${styles.actions}`}>
                    {target ? (
                      <Link
                        to={target.to}
                        className="sapphire-button sapphire-button--tertiary sapphire-button--sm"
                      >
                        <span className="sapphire-button__content">{target.label}</span>
                      </Link>
                    ) : null}

                    {notification.status === NotificationStatus.UNREAD ? (
                      <button
                        type="button"
                        className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                        onClick={() => {
                          markReadMutation.mutate(notification.id);
                        }}
                        disabled={isMutating}
                      >
                        <span className="sapphire-button__content">Mark read</span>
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="sapphire-button sapphire-button--tertiary sapphire-button--sm"
                      onClick={() => {
                        dismissMutation.mutate(notification.id);
                      }}
                      disabled={isMutating}
                    >
                      <span className="sapphire-button__content">Dismiss</span>
                    </button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
