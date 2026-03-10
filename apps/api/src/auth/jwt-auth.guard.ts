import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Reusable JWT guard.  Apply with `@UseGuards(JwtAuthGuard)` on any
 * controller or method that requires an authenticated caller.
 *
 * The guard leaves existing endpoints unprotected until the
 * phase9a-rbac-integration slice adopts it app-wide.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
