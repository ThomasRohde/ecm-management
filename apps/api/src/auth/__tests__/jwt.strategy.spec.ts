import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtStrategy } from '../jwt.strategy';
import type { AuthTokenPayload } from '../auth.types';
import type { PrismaService } from '../../prisma/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const activeUser = {
  id: 'user-id-123',
  email: 'bob@example.com',
  role: UserRole.STEWARD,
  isActive: true,
};

function makeStrategy(userRecord: typeof activeUser | null): JwtStrategy {
  const mockPrisma = {
    user: { findUnique: jest.fn().mockResolvedValue(userRecord) },
  } as unknown as PrismaService;
  return new JwtStrategy(mockPrisma);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('JwtStrategy', () => {
  it('returns a refreshed payload from DB when user is active', async () => {
    const strategy = makeStrategy(activeUser);
    const payload: AuthTokenPayload = {
      sub: activeUser.id,
      email: activeUser.email,
      role: UserRole.VIEWER, // stale role in token
    };
    const result = await strategy.validate(payload);
    // role must be from DB, not stale token
    expect(result.role).toBe(UserRole.STEWARD);
    expect(result.sub).toBe(activeUser.id);
  });

  it('throws UnauthorizedException when user is not found in DB', async () => {
    const strategy = makeStrategy(null);
    await expect(
      strategy.validate({ sub: 'missing-id', email: 'x@x.com', role: UserRole.VIEWER }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when user is inactive', async () => {
    const strategy = makeStrategy({ ...activeUser, isActive: false });
    await expect(
      strategy.validate({ sub: activeUser.id, email: activeUser.email, role: UserRole.STEWARD }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when payload has no sub', async () => {
    const strategy = makeStrategy(activeUser);
    await expect(
      strategy.validate({} as AuthTokenPayload),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when payload is falsy', async () => {
    const strategy = makeStrategy(activeUser);
    await expect(
      strategy.validate(null as unknown as AuthTokenPayload),
    ).rejects.toThrow(UnauthorizedException);
  });
});

