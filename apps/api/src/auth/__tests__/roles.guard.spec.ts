import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../roles.guard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeContext(userRole: UserRole | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: userRole ? { role: userRole } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

function makeGuard(requiredRoles: UserRole[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  it('allows any authenticated user when no @Roles() metadata is set', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeContext(UserRole.VIEWER))).toBe(true);
  });

  it('allows when the user role is in the required list', () => {
    const guard = makeGuard([UserRole.CURATOR, UserRole.ADMIN]);
    expect(guard.canActivate(makeContext(UserRole.CURATOR))).toBe(true);
  });

  it('throws ForbiddenException when user role is not in the required list', () => {
    const guard = makeGuard([UserRole.CURATOR, UserRole.ADMIN]);
    expect(() => guard.canActivate(makeContext(UserRole.VIEWER))).toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when request has no user', () => {
    const guard = makeGuard([UserRole.ADMIN]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('allows ADMIN when ADMIN is in required roles', () => {
    const guard = makeGuard([UserRole.ADMIN]);
    expect(guard.canActivate(makeContext(UserRole.ADMIN))).toBe(true);
  });

  it('allows with empty required roles array', () => {
    const guard = makeGuard([]);
    expect(guard.canActivate(makeContext(UserRole.VIEWER))).toBe(true);
  });

  it('includes role info in the ForbiddenException message', () => {
    const guard = makeGuard([UserRole.GOVERNANCE_APPROVER]);
    let thrown: Error | undefined;
    try {
      guard.canActivate(makeContext(UserRole.CONTRIBUTOR));
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(thrown?.message).toContain('GOVERNANCE_APPROVER');
    expect(thrown?.message).toContain('CONTRIBUTOR');
  });
});
