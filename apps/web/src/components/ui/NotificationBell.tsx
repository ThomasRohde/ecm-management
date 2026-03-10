import { Link } from 'react-router-dom';
import { useNotifications } from '../../api/notifications';
import { useAuth } from '../../contexts/AuthContext';
import styles from './NotificationBell.module.css';

function formatUnreadCount(value: number): string {
  return value > 99 ? '99+' : String(value);
}

export function NotificationBell() {
  const { user, isAuthenticated } = useAuth();
  const notificationsQuery = useNotifications(
    isAuthenticated && user ? { recipientId: user.id, limit: 5 } : null,
  );
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const label =
    unreadCount > 0
      ? `Open notifications inbox (${unreadCount} unread)`
      : 'Open notifications inbox';

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <Link
      to="/notifications"
      className={`sapphire-button sapphire-button--tertiary sapphire-button--sm ${styles.bell}`}
      aria-label={label}
    >
      <span className="sapphire-button__content">
        Inbox
        {unreadCount > 0 ? (
          <span className={styles.badge} aria-hidden="true">
            {formatUnreadCount(unreadCount)}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
