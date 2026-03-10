/**
 * Auth-specific shared types for the API layer.
 * These intentionally mirror @ecm/shared contracts but avoid the ESM/CJS
 * boundary issue – the API is CommonJS while @ecm/shared is ESM.
 */
import type { UserRole } from '@prisma/client';

/** JWT payload embedded in access tokens. */
export interface AuthTokenPayload {
  /** Subject – the User.id. */
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/** Public user shape returned by the API – no sensitive fields. */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Response from login / register. */
export interface LoginResponse {
  accessToken: string;
  user: PublicUser;
}
