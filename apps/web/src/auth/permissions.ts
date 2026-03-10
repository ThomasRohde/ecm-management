/**
 * Centralized frontend RBAC permission helper for Phase 9A.
 *
 * This module provides a single source of truth for permission checks across
 * the frontend. It normalizes legacy role strings from getUserRole() and maps
 * them to UserRole enums, then exposes clear permission helpers for all
 * mutation and approval actions.
 *
 * Keep read surfaces accessible, but hide/disable mutation/approval/release/
 * what-if actions unless the current role is allowed.
 */

import { UserRole } from '@ecm/shared';
import { getUserRole } from '../api/identity';

/**
 * Maps legacy role strings (from identity bridge) back to UserRole enum.
 * This is the inverse of ROLE_TO_LEGACY in identity.ts.
 */
const LEGACY_TO_ROLE: Record<string, UserRole> = {
  'curator': UserRole.CURATOR,
  'governance-board': UserRole.GOVERNANCE_APPROVER,
  'viewer': UserRole.VIEWER,
  'contributor': UserRole.CONTRIBUTOR,
  'steward': UserRole.STEWARD,
  'integration-engineer': UserRole.INTEGRATION_ENGINEER,
  'admin': UserRole.ADMIN,
};

/**
 * Normalizes the current user's role from localStorage into a UserRole enum.
 * Returns null if no role is set or if the role is unrecognized.
 */
export function getCurrentUserRole(): UserRole | null {
  const rawRole = getUserRole();
  if (!rawRole) return null;

  const legacyRole = rawRole.trim().toLowerCase();
  if (!legacyRole) return null;

  // Try uppercase direct match first (for new format)
  if (Object.values(UserRole).includes(legacyRole.toUpperCase() as UserRole)) {
    return legacyRole.toUpperCase() as UserRole;
  }

  // Try legacy mapping
  return LEGACY_TO_ROLE[legacyRole] ?? null;
}

/**
 * Checks if the current user has one of the specified roles.
 */
export function hasAnyRole(allowedRoles: UserRole[]): boolean {
  const currentRole = getCurrentUserRole();
  if (!currentRole) return false;
  return allowedRoles.includes(currentRole);
}

/**
 * Checks if the current user has the specified role.
 */
export function hasRole(role: UserRole): boolean {
  return getCurrentUserRole() === role;
}

// ─── Permission Helpers ───────────────────────────────────────────────────────

/**
 * Can the current user create new capabilities?
 * Allowed: CURATOR, ADMIN
 */
export function canCreateCapability(): boolean {
  return hasAnyRole([UserRole.CURATOR, UserRole.ADMIN]);
}

/**
 * Can the current user import capabilities through the CSV import flow?
 * Allowed: CURATOR, ADMIN
 */
export function canImportCapabilities(): boolean {
  return hasAnyRole([UserRole.CURATOR, UserRole.ADMIN]);
}

/**
 * Can the current user edit capability metadata (name, description, stewardship)?
 * Allowed: CONTRIBUTOR, STEWARD, CURATOR, ADMIN
 */
export function canEditCapabilityMetadata(): boolean {
  return hasAnyRole([
    UserRole.CONTRIBUTOR,
    UserRole.STEWARD,
    UserRole.CURATOR,
    UserRole.ADMIN,
  ]);
}

/**
 * Can the current user perform structural operations (reparent, merge, promote, demote, retire)?
 * Allowed: CURATOR, ADMIN
 */
export function canPerformStructuralOperations(): boolean {
  return hasAnyRole([UserRole.CURATOR, UserRole.ADMIN]);
}

/**
 * Can the current user delete draft capabilities?
 * Allowed: CURATOR, ADMIN
 */
export function canDeleteCapability(): boolean {
  return hasAnyRole([UserRole.CURATOR, UserRole.ADMIN]);
}

/**
 * Can the current user create/manage change requests?
 * Allowed: CURATOR, ADMIN
 */
export function canManageChangeRequests(): boolean {
  return hasAnyRole([UserRole.CURATOR, UserRole.ADMIN]);
}

/**
 * Can the current user approve change requests?
 * Allowed: CURATOR, GOVERNANCE_APPROVER, ADMIN
 */
export function canApproveChangeRequests(): boolean {
  return hasAnyRole([UserRole.CURATOR, UserRole.GOVERNANCE_APPROVER, UserRole.ADMIN]);
}

/**
 * Can the current user manage system mappings (create/update/delete)?
 * Allowed: INTEGRATION_ENGINEER, ADMIN
 */
export function canManageMappings(): boolean {
  return hasAnyRole([UserRole.INTEGRATION_ENGINEER, UserRole.ADMIN]);
}

/**
 * Can the current user manage downstream consumer registrations and sync visibility?
 * Allowed: INTEGRATION_ENGINEER, ADMIN
 */
export function canManageDownstreamConsumers(): boolean {
  return hasAnyRole([UserRole.INTEGRATION_ENGINEER, UserRole.ADMIN]);
}

/**
 * Can the current user manage what-if branches (create/discard)?
 * Allowed: CURATOR, ADMIN
 */
export function canManageWhatIfBranches(): boolean {
  return hasAnyRole([UserRole.CURATOR, UserRole.ADMIN]);
}

/**
 * Can the current user publish or rollback model versions?
 * Allowed: CURATOR, GOVERNANCE_APPROVER, ADMIN
 */
export function canManageReleases(): boolean {
  return hasAnyRole([UserRole.CURATOR, UserRole.GOVERNANCE_APPROVER, UserRole.ADMIN]);
}

/**
 * Can the current user view the global audit trail?
 * Allowed: ADMIN
 */
export function canViewAudit(): boolean {
  return hasRole(UserRole.ADMIN);
}

/**
 * Returns a human-readable message explaining why an action is not allowed.
 */
export function getPermissionDeniedMessage(action: string): string {
  const currentRole = getCurrentUserRole();
  if (!currentRole) {
    return `You must be logged in to ${action}.`;
  }
  return `Your current role (${currentRole}) does not have permission to ${action}.`;
}
