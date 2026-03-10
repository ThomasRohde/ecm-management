import { IsString } from 'class-validator';

/** Minimal body DTO used for ownership-gated notification mutations. */
export class RecipientIdDto {
  /**
   * ID of the acting recipient. Until Phase 9A auth lands this is
   * forwarded from the caller; post-auth it will come from the JWT.
   */
  @IsString()
  recipientId!: string;
}
