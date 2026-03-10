import { UserRole } from '@prisma/client';

export type WorkflowApprovalRole = 'curator' | 'governance-board';

const legacyRoleMap: Record<string, UserRole> = {
  viewer: UserRole.VIEWER,
  contributor: UserRole.CONTRIBUTOR,
  steward: UserRole.STEWARD,
  curator: UserRole.CURATOR,
  'governance-board': UserRole.GOVERNANCE_APPROVER,
  'governance-approver': UserRole.GOVERNANCE_APPROVER,
  governanceapprover: UserRole.GOVERNANCE_APPROVER,
  'integration-engineer': UserRole.INTEGRATION_ENGINEER,
  integrationengineer: UserRole.INTEGRATION_ENGINEER,
  admin: UserRole.ADMIN,
};

export const capabilityEditRoles = [
  UserRole.CONTRIBUTOR,
  UserRole.STEWARD,
  UserRole.CURATOR,
  UserRole.ADMIN,
] as const;

export const capabilityManagementRoles = [UserRole.CURATOR, UserRole.ADMIN] as const;

export const changeRequestManagementRoles = [UserRole.CURATOR, UserRole.ADMIN] as const;

export const changeRequestDecisionRoles = [
  UserRole.CURATOR,
  UserRole.GOVERNANCE_APPROVER,
  UserRole.ADMIN,
] as const;

export const mappingManagementRoles = [
  UserRole.INTEGRATION_ENGINEER,
  UserRole.ADMIN,
] as const;

export const releaseManagementRoles = [
  UserRole.CURATOR,
  UserRole.GOVERNANCE_APPROVER,
  UserRole.ADMIN,
] as const;

export const auditViewerRoles = [UserRole.ADMIN] as const;

export function normalizeLegacyUserRole(raw: string | null | undefined): string | null {
  const normalized = raw?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return normalized.replace(/[\s_]+/g, '-');
}

export function userRoleFromLegacyRole(raw: string | null | undefined): UserRole | null {
  const normalized = normalizeLegacyUserRole(raw);

  if (!normalized) {
    return null;
  }

  return legacyRoleMap[normalized] ?? null;
}

export function legacyRoleFromUserRole(role: UserRole): string {
  switch (role) {
    case UserRole.VIEWER:
      return 'viewer';
    case UserRole.CONTRIBUTOR:
      return 'contributor';
    case UserRole.STEWARD:
      return 'steward';
    case UserRole.CURATOR:
      return 'curator';
    case UserRole.GOVERNANCE_APPROVER:
      return 'governance-board';
    case UserRole.INTEGRATION_ENGINEER:
      return 'integration-engineer';
    case UserRole.ADMIN:
      return 'admin';
  }
}

export function workflowApprovalRoleFromUserRole(
  role: UserRole,
): WorkflowApprovalRole | null {
  if (role === UserRole.CURATOR) {
    return 'curator';
  }

  if (role === UserRole.GOVERNANCE_APPROVER) {
    return 'governance-board';
  }

  return null;
}
