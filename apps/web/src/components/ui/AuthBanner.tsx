import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { NotificationBell } from './NotificationBell';
import styles from './AuthBanner.module.css';

export function AuthBanner() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated || !user) {
    return (
      <div className={styles.banner} role="region" aria-label="Authentication status">
        <span className={styles.label}>Not signed in</span>
        <Link
          to="/login"
          className="sapphire-button sapphire-button--primary sapphire-button--sm"
        >
          <span className="sapphire-button__content">Sign in</span>
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.banner} role="region" aria-label="User information">
      <div className={styles.userInfo}>
        <span className={styles.displayName}>{user.displayName}</span>
        <span className={styles.role}>
          {user.role.charAt(0) + user.role.slice(1).toLowerCase().replace(/_/g, ' ')}
        </span>
      </div>
      <div className={styles.actions}>
        <NotificationBell />
        <button
          type="button"
          className="sapphire-button sapphire-button--secondary sapphire-button--sm"
          onClick={logout}
        >
          <span className="sapphire-button__content">Sign out</span>
        </button>
      </div>
    </div>
  );
}
