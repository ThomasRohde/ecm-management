import type { User } from '@ecm/shared';

const USER_ID_KEY = 'ecm:userId';
const USER_ROLE_KEY = 'ecm:userRole';

/**
 * These key constants must stay in sync with apps/web/src/api/auth.ts.
 * They are redefined here to avoid a circular import between identity ↔ auth.
 */
const AUTH_TOKEN_KEY = 'ecm:auth:token';

/**
 * Maps backend UserRole enum values to the legacy frontend role strings that
 * existing pages (ChangeRequestDetailPage, etc.) compare against.
 * This bridge exists only during the RBAC-integration transition; once
 * phase9a-rbac-integration lands, the pages will use the enum directly.
 */
const ROLE_TO_LEGACY: Record<string, string> = {
  VIEWER: 'viewer',
  CONTRIBUTOR: 'contributor',
  STEWARD: 'steward',
  CURATOR: 'curator',
  GOVERNANCE_APPROVER: 'governance-board',
  INTEGRATION_ENGINEER: 'integration-engineer',
  ADMIN: 'admin',
};

export const KNOWN_ROLES = [
  { value: '', label: 'No role' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'steward', label: 'Steward' },
  { value: 'curator', label: 'Curator' },
  { value: 'governance-board', label: 'Governance Board' },
  { value: 'integration-engineer', label: 'Integration Engineer' },
  { value: 'admin', label: 'Admin' },
] as const;

// ─── Auth ↔ legacy bridge ─────────────────────────────────────────────────────

/**
 * Called by AuthContext after a successful login / token refresh.
 * Writes the authenticated user's id and role into the legacy localStorage
 * keys so that existing callers of getUserId() / getUserRole() transparently
 * receive real values without any code changes.
 */
export function syncAuthToIdentity(user: User): void {
  localStorage.setItem(USER_ID_KEY, user.id);
  const legacyRole = ROLE_TO_LEGACY[user.role] ?? user.role.toLowerCase();
  localStorage.setItem(USER_ROLE_KEY, legacyRole);
}

/**
 * Called by AuthContext on logout.
 * Clears the legacy keys so pages see an unauthenticated state.
 */
export function clearAuthFromIdentity(): void {
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_ROLE_KEY);
}

// ─── Legacy identity API (unchanged surface) ──────────────────────────────────

export function getUserId(): string {
  return localStorage.getItem(USER_ID_KEY) ?? '';
}

export function setUserId(id: string): void {
  if (id.trim()) {
    localStorage.setItem(USER_ID_KEY, id.trim());
  } else {
    localStorage.removeItem(USER_ID_KEY);
  }
}

export function getUserRole(): string {
  return localStorage.getItem(USER_ROLE_KEY) ?? '';
}

export function setUserRole(role: string): void {
  if (role.trim()) {
    localStorage.setItem(USER_ROLE_KEY, role.trim());
  } else {
    localStorage.removeItem(USER_ROLE_KEY);
  }
}

/**
 * Returns headers for API calls.
 *
 * After a successful login this now includes:
 *  - `Authorization: Bearer <token>` — for endpoints protected by JwtAuthGuard
 *  - `x-user-id` / `x-user-role`     — for endpoints still using the interim
 *    actor-header pattern (removed in phase9a-rbac-integration)
 *
 * When no JWT is present the function falls back to the legacy header-only
 * behaviour so unauthenticated/dev usage is unaffected.
 */
export function getIdentityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const userId = getUserId();
  const userRole = getUserRole();
  if (userId) headers['x-user-id'] = userId;
  if (userRole) headers['x-user-role'] = userRole;

  return headers;
}
