import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

/**
 * Metadata key used by RolesGuard to read the required role list.
 * @internal
 */
export const ROLES_KEY = 'roles';

/**
 * Attaches a required-role list to a controller or route handler.
 *
 * @example
 * ```ts
 * @Roles(UserRole.CURATOR, UserRole.ADMIN)
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Post('publish')
 * publish() { ... }
 * ```
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
