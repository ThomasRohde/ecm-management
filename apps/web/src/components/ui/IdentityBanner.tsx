import { useState } from 'react';
import {
  getUserId,
  getUserRole,
  setUserId,
  setUserRole,
  KNOWN_ROLES,
} from '../../api/identity';
import styles from './IdentityBanner.module.css';

/**
 * Interim identity banner shown until a real AuthModule exists.
 * Allows selecting a user ID and role to drive the x-user-id / x-user-role
 * headers sent with change-request API calls.
 */
export function IdentityBanner() {
  const [userId, setUserIdState] = useState(getUserId);
  const [userRole, setUserRoleState] = useState(getUserRole);

  function handleUserIdChange(value: string) {
    setUserIdState(value);
    setUserId(value);
  }

  function handleRoleChange(value: string) {
    setUserRoleState(value);
    setUserRole(value);
  }

  return (
    <div className={styles.banner} role="region" aria-label="Interim identity configuration">
      <span className={styles.label}>⚠ Dev identity</span>
      <div className={styles.fields}>
        <label htmlFor="identity-user-id" className="visually-hidden">
          User ID
        </label>
        <input
          id="identity-user-id"
          type="text"
          className={styles.input}
          placeholder="User ID (e.g. alice)"
          value={userId}
          onChange={(e) => { handleUserIdChange(e.target.value); }}
          aria-label="Acting user ID"
        />

        <label htmlFor="identity-role">
          <span className="visually-hidden">Role</span>
        </label>
        <select
          id="identity-role"
          className={styles.select}
          value={userRole}
          onChange={(e) => { handleRoleChange(e.target.value); }}
          aria-label="Acting role"
        >
          {KNOWN_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <span className="sapphire-text sapphire-text--secondary" style={{ fontSize: 'var(--sapphire-semantic-size-font-xs)' }}>
        No auth yet — headers only
      </span>
    </div>
  );
}
