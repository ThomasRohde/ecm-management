import { Test, type TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
// ─── Helpers ─────────────────────────────────────────────────────────────────

const fakeUser = {
  id: 'aaa-bbb-ccc',
  email: 'alice@example.com',
  displayName: 'Alice',
  passwordHash: '$2b$12$hashedpassword',
  role: UserRole.CONTRIBUTOR,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  notifications: [],
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('signed.jwt.token'),
};

// bcrypt is mocked at the module level to avoid native binary issues in tests
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$mocked'),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    it('hashes the password and stores the user', async () => {
      mockPrisma.user.create.mockResolvedValueOnce(fakeUser);

      const result = await service.register({
        email: 'Alice@EXAMPLE.COM',
        displayName: 'Alice',
        password: 'password123',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'alice@example.com',
            passwordHash: '$2b$12$mocked',
          }),
        }),
      );
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException when Prisma raises P2002 (duplicate email)', async () => {
      const prismaError = Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
      });
      mockPrisma.user.create.mockRejectedValueOnce(prismaError);

      await expect(
        service.register({
          email: 'alice@example.com',
          displayName: 'Alice',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('normalises email to lowercase', async () => {
      mockPrisma.user.create.mockResolvedValueOnce(fakeUser);

      await service.register({
        email: 'Alice@Example.COM',
        displayName: 'Alice',
        password: 'password123',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'alice@example.com' }),
        }),
      );
    });

    it('assigns VIEWER role regardless of dto.role in non-dev env', async () => {
      const savedEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        mockPrisma.user.create.mockResolvedValueOnce(fakeUser);
        await service.register({
          email: 'alice@example.com',
          displayName: 'Alice',
          password: 'password123',
          role: UserRole.ADMIN,
        });
        expect(mockPrisma.user.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ role: UserRole.VIEWER }),
          }),
        );
      } finally {
        process.env.NODE_ENV = savedEnv;
      }
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    beforeEach(() => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    });

    it('returns a JWT response for valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(fakeUser);

      const result = await service.login({
        email: 'alice@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.email).toBe('alice@example.com');
    });

    it('throws UnauthorizedException for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.login({ email: 'nobody@x.com', password: 'pw' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(fakeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.login({ email: 'alice@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for inactive user', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...fakeUser,
        isActive: false,
      });

      await expect(
        service.login({ email: 'alice@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── getMe ──────────────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('returns public user shape without passwordHash', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(fakeUser);

      const result = await service.getMe(fakeUser.id);

      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('alice@example.com');
    });

    it('throws UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.getMe('missing-id')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── JWT payload ────────────────────────────────────────────────────────────

  describe('JWT payload', () => {
    it('includes sub, email, and role in signed payload', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(fakeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      await service.login({
        email: 'alice@example.com',
        password: 'password123',
      });

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: fakeUser.id,
          email: fakeUser.email,
          role: fakeUser.role,
        }),
      );
    });
  });
});
