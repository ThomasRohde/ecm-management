import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthTokenPayload } from './auth.types';

/**
 * Auth controller.  All routes live under the global `/api/v1` prefix.
 *
 *   POST /api/v1/auth/register  – create a local account, returns JWT + user
 *   POST /api/v1/auth/login     – verify credentials, returns JWT + user
 *   GET  /api/v1/auth/me        – returns the caller's public user record
 *
 * The register and login endpoints are intentionally public (no auth guard).
 * The /me endpoint requires a valid JWT.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthTokenPayload) {
    return this.authService.getMe(user.sub);
  }
}
