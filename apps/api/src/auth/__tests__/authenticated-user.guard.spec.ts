import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUserGuard } from '../authenticated-user.guard';

function makeContext(headers: Record<string, string | undefined>) {
  const request = { headers } as {
    headers: Record<string, string | undefined>;
    user?: unknown;
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('AuthenticatedUserGuard', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.resetAllMocks();
  });

  it('hydrates request.user from a valid bearer token', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'user@example.com',
        role: UserRole.ADMIN,
        iat: 123,
        exp: 456,
      }),
    } as unknown as JwtService;
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          role: UserRole.ADMIN,
          isActive: true,
        }),
      },
    } as unknown as PrismaService;
    const guard = new AuthenticatedUserGuard(jwtService, prisma);
    const { context, request } = makeContext({
      authorization: 'Bearer valid-token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      sub: 'user-1',
      email: 'user@example.com',
      role: UserRole.ADMIN,
      iat: 123,
      exp: 456,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  });

  it('falls back to legacy headers outside production', async () => {
    process.env.NODE_ENV = 'test';
    const jwtService = {
      verifyAsync: jest.fn(),
    } as unknown as JwtService;
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    const guard = new AuthenticatedUserGuard(jwtService, prisma);
    const { context, request } = makeContext({
      'x-user-id': 'legacy-user',
      'x-user-role': 'integration_engineer',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      sub: 'legacy-user',
      email: '',
      role: UserRole.INTEGRATION_ENGINEER,
    });
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('defaults legacy header auth to VIEWER when role is missing', async () => {
    process.env.NODE_ENV = 'test';
    const guard = new AuthenticatedUserGuard(
      { verifyAsync: jest.fn() } as unknown as JwtService,
      { user: { findUnique: jest.fn() } } as unknown as PrismaService,
    );
    const { context, request } = makeContext({
      'x-user-id': 'viewer-user',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      sub: 'viewer-user',
      email: '',
      role: UserRole.VIEWER,
    });
  });

  it('rejects invalid bearer tokens', async () => {
    const guard = new AuthenticatedUserGuard(
      {
        verifyAsync: jest.fn().mockRejectedValue(new Error('bad token')),
      } as unknown as JwtService,
      { user: { findUnique: jest.fn() } } as unknown as PrismaService,
    );

    await expect(
      guard.canActivate(makeContext({ authorization: 'Bearer nope' }).context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects missing auth in production', async () => {
    process.env.NODE_ENV = 'production';
    const guard = new AuthenticatedUserGuard(
      { verifyAsync: jest.fn() } as unknown as JwtService,
      { user: { findUnique: jest.fn() } } as unknown as PrismaService,
    );

    await expect(guard.canActivate(makeContext({}).context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
