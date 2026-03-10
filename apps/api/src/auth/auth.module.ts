import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthenticatedUserGuard } from './authenticated-user.guard';

/**
 * AuthModule wires together the JWT / Passport infrastructure.
 *
 * Exported symbols available to other modules:
 *   - AuthService      – register / login / getMe helpers
 *   - JwtAuthGuard     – apply with @UseGuards(JwtAuthGuard)
 *   - RolesGuard       – apply after JwtAuthGuard with @UseGuards(JwtAuthGuard, RolesGuard)
 *   - JwtModule        – so other modules can call JwtService.sign() if needed
 *
 * JWT configuration uses registerAsync so that the factory runs inside
 * bootstrap() — after loadEnvironment() has populated process.env — rather
 * than at module-import time (which would read env before dotenv runs).
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'change-me-in-production',
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    AuthenticatedUserGuard,
    RolesGuard,
  ],
  exports: [AuthService, JwtAuthGuard, AuthenticatedUserGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
