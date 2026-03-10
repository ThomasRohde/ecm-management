import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthTokenPayload } from './auth.types';

/**
 * Validates the Bearer JWT in incoming requests.
 *
 * After verifying the token signature, we do a lightweight DB lookup so that
 * deactivated users or role changes take effect immediately rather than waiting
 * until token expiry.  The returned payload is stored at `request.user`.
 *
 * The `@CurrentUser()` decorator (current-user.decorator.ts) surfaces it.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me-in-production',
    });
  }

  /**
   * Called by Passport after the token signature is verified.
   * Performs a DB lookup so revoked / deactivated accounts are rejected
   * immediately rather than waiting for token expiry.
   * Return value is stored as `request.user`.
   */
  async validate(payload: AuthTokenPayload): Promise<AuthTokenPayload> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or account deactivated.');
    }

    // Return current DB role so stale role claims in the token are overridden.
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
