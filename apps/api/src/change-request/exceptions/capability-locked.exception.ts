import { ConflictException } from '@nestjs/common';

export class CapabilityLockedException extends ConflictException {
  constructor(lockedCapabilityIds: string[]) {
    super(
      `The following capabilities are already locked by another change request: ${lockedCapabilityIds.join(', ')}`,
    );
  }
}
