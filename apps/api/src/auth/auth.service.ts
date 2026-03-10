import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Prisma, User as PrismaUser } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { AuthTokenPayload, LoginResponse, PublicUser } from './auth.types';

/** bcrypt work-factor.  12 is a safe local-dev default (sub-100 ms). */
const BCRYPT_ROUNDS = 12;

/**
 * Strips the `passwordHash` field and serialises dates to ISO strings so the
 * result matches the `User` shared contract.
 */
function toPublicUser(u: PrismaUser): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // ── Register ───────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<LoginResponse> {
    // Role override is only honoured in local development to ease E2E testing.
    // In all other environments public registration always produces a VIEWER.
    const role =
      process.env.NODE_ENV === 'development'
        ? (dto.role ?? UserRole.VIEWER)
        : UserRole.VIEWER;

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          displayName: dto.displayName,
          passwordHash,
          role,
        },
      });
      return this._issueTokenResponse(user);
    } catch (err) {
      // Prisma unique-constraint violation (P2002) – another request created
      // the same email between our validation and the INSERT.
      if ((err as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
        throw new ConflictException(
          `A user with email "${dto.email}" already exists.`,
        );
      }
      throw err;
    }
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this._issueTokenResponse(user);
  }

  // ── Me ─────────────────────────────────────────────────────────────────────

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive.');
    }
    return toPublicUser(user);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _issueTokenResponse(user: PrismaUser): LoginResponse {
    const payload: AuthTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: toPublicUser(user),
    };
  }
}
