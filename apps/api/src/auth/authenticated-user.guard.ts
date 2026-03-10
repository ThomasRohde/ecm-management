import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthTokenPayload } from './auth.types';
import { userRoleFromLegacyRole } from './user-role.utils';

interface RequestHeaders {
  authorization?: string | string[];
  'x-user-id'?: string | string[];
  'x-user-role'?: string | string[];
}

interface AuthenticatedRequest {
  headers: RequestHeaders;
  user?: AuthTokenPayload;
}

@Injectable()
export class AuthenticatedUserGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bearerToken = this.extractBearerToken(request);

    if (bearerToken) {
      request.user = await this.authenticateWithJwt(bearerToken);
      return true;
    }

    const fallbackUser = this.resolveLegacyHeaderUser(request);
    if (fallbackUser) {
      request.user = fallbackUser;
      return true;
    }

    throw new UnauthorizedException('Authentication required.');
  }

  private extractBearerToken(request: AuthenticatedRequest): string | null {
    const headerValue = this.readHeader(request.headers.authorization);

    if (!headerValue) {
      return null;
    }

    const [scheme, token] = headerValue.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
      throw new UnauthorizedException('Invalid Authorization header.');
    }

    return token.trim();
  }

  private async authenticateWithJwt(token: string): Promise<AuthTokenPayload> {
    let payload: AuthTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token, {
        secret: process.env.JWT_SECRET ?? 'change-me-in-production',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Authenticated user is not active.');
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: payload.iat,
      exp: payload.exp,
    };
  }

  private resolveLegacyHeaderUser(request: AuthenticatedRequest): AuthTokenPayload | null {
    if (process.env.NODE_ENV === 'production') {
      return null;
    }

    const userId = this.readHeader(request.headers['x-user-id'])?.trim();
    if (!userId) {
      return null;
    }

    const role =
      userRoleFromLegacyRole(this.readHeader(request.headers['x-user-role'])) ??
      UserRole.VIEWER;

    return {
      sub: userId,
      email: '',
      role,
    };
  }

  private readHeader(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }
}
