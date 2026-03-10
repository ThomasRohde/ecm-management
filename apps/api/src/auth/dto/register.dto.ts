import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  /**
   * Role override — accepted **only in development** to ease local testing.
   * In non-development environments this field is ignored and callers always
   * receive the VIEWER role.  A dedicated admin-only user-management endpoint
   * (out of scope for this slice) will handle role assignment in production.
   */
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
