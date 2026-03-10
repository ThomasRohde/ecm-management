import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthTokenPayload } from './auth.types';

/**
 * Route parameter decorator that returns the JWT payload for the
 * authenticated caller.
 *
 * Requires an auth guard to have run first (which populates `request.user`).
 *
 * @example
 * ```ts
 * @Get('me')
 * @UseGuards(JwtAuthGuard)
 * getMe(@CurrentUser() user: AuthTokenPayload) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthTokenPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthTokenPayload }>();
    return request.user;
  },
);
