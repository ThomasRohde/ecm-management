/**
 * Phase 9A – Auth / RBAC shared contracts.
 *
 * These types mirror the Prisma `User` model and `UserRole` enum.
 * The `passwordHash` field is intentionally omitted — it must never
 * leave the API boundary.
 */

/** Roles mirror the permission matrix defined in PLAN.md § Phase 9A. */
export enum UserRole {
  VIEWER = 'VIEWER',
  CONTRIBUTOR = 'CONTRIBUTOR',
  STEWARD = 'STEWARD',
  CURATOR = 'CURATOR',
  GOVERNANCE_APPROVER = 'GOVERNANCE_APPROVER',
  INTEGRATION_ENGINEER = 'INTEGRATION_ENGINEER',
  ADMIN = 'ADMIN',
}

/** Public user shape returned by the API – no sensitive fields. */
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** JWT payload embedded in access tokens. */
export interface AuthTokenPayload {
  /** Subject – the User.id. */
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// ─── Input shapes (used by the auth module in Phase 9A) ─────────────────────

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  displayName?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UserListResponse {
  items: User[];
  total: number;
}
