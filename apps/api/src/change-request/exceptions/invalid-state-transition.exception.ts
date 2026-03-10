import { BadRequestException } from '@nestjs/common';
import type { ChangeRequestStatus } from '@prisma/client';

export class InvalidStateTransitionException extends BadRequestException {
  constructor(from: ChangeRequestStatus, action: string) {
    super(
      `Cannot perform "${action}" on a change request with status "${from}"`,
    );
  }
}
