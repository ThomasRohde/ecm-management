import { ForbiddenException } from '@nestjs/common';

export class InsufficientApprovalRoleException extends ForbiddenException {
  constructor(reason: string) {
    super(`Insufficient role for this approval action: ${reason}`);
  }
}
