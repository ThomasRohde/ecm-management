import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

/**
 * RBAC guard – checks that the authenticated user's role is in the set
 * declared by `@Roles(...)` on the route handler.
 *
 * Must be combined with `JwtAuthGuard` (apply JwtAuthGuard first so that
 * `request.user` is populated before this guard runs).
 *
 * If no `@Roles(...)` decorator is present the route is allowed for any
 * authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No role restriction declared – allow any authenticated user through.
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { role?: UserRole } }>();

    const userRole = request.user?.role;
    if (!userRole || !required.includes(userRole)) {
      throw new ForbiddenException(
        `Requires one of: ${required.join(', ')}. You have: ${userRole ?? 'none'}.`,
      );
    }
    return true;
  }
}
